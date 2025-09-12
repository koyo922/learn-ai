import os
from typing import Tuple

from dune_client.client import DuneClient
import pandas as pd
import dotenv
dotenv.load_dotenv("../.env", override=True)
assert 'DUNE_API_KEY' in os.environ, "DUNE_API_KEY is not set"

dune = DuneClient.from_env()

DF = pd.DataFrame


def get_deployer_funder(address_list: list[str]) -> Tuple[DF, DF]:
    """
    查询BSC地址的部署者和资助者信息

    返回值：
    1. 部署关系DataFrame：合约地址 -> 部署者
    2. 资助关系DataFrame：所有地址 -> 第一个资助者
    """

    # 优雅的单查询版本 - 使用CTE和UNION ALL
    values_list = ",".join([f"({addr})" for addr in address_list])

    sql = f"""
    WITH address_list(target_address) AS (
        VALUES {values_list}
    ),
    
    -- 部署关系查询 - 使用creation_traces表更高效，添加分区优化
    deployments AS (
        SELECT 
            al.target_address as contract_address,
            ct."from" as deployer,
            ct.tx_hash,
            ct.block_number,
            ct.block_time,
            ROW_NUMBER() OVER (PARTITION BY al.target_address ORDER BY ct.block_number ASC) as rn
        FROM address_list al
        LEFT JOIN bnb.creation_traces ct ON ct.address = al.target_address
            AND ct.block_number >= 100000
    ),
    
    -- 资助关系查询 - 只获取原生BNB转账，使用分区字段优化
    funding AS (
        SELECT 
            al.target_address as recipient,
            t."from" as funder,
            t.hash as tx_hash,
            t.block_number,
            t.block_time,
            t.value / 1e18 as amount_bnb,
            ROW_NUMBER() OVER (PARTITION BY al.target_address ORDER BY t.block_number ASC) as rn
        FROM address_list al
        LEFT JOIN bnb.transactions t ON t."to" = al.target_address
            AND t.block_number >= 100000
            AND t.value > 0
            AND t.data = 0x  -- 只要原生BNB转账
    )
    
    -- 返回两个结果集
    SELECT 
        'deployments' as query_type,
        contract_address as address,
        deployer as actor,  -- 统一为actor字段
        tx_hash,
        block_number,
        block_time,
        CAST(NULL as DOUBLE) as amount_bnb
    FROM deployments
    WHERE rn = 1
    
    UNION ALL
    
    SELECT 
        'funding' as query_type,
        recipient as address,
        funder as actor,    -- 统一为actor字段
        tx_hash,
        block_number,
        block_time,
        amount_bnb
    FROM funding
    WHERE rn = 1
    
    ORDER BY query_type, address
    """

    try:
        print("执行优化查询...")
        print("SQL查询:")
        print(sql)

        # 使用 run_sql 提高性能，传入原始SQL字符串
        result = dune.run_sql(
            sql,
            performance='large',   # 使用large性能级别
            ping_frequency=5       # 每5秒检查一次执行状态
        )

        # 转换为DataFrame
        result_df = pd.DataFrame(result.result.rows)

        print(f"查询成功，获得 {len(result_df)} 条记录")

        if result_df.empty:
            return pd.DataFrame(), pd.DataFrame()

        # 分离两个结果集
        deploy_df = result_df[result_df['query_type'] == 'deployments'].drop('query_type', axis=1)
        deploy_df = deploy_df.rename(columns={'address': 'contract_address', 'actor': 'deployer'})
        deploy_df = deploy_df[['contract_address', 'deployer', 'tx_hash', 'block_number', 'block_time']]

        funder_df = result_df[result_df['query_type'] == 'funding'].drop('query_type', axis=1)
        funder_df = funder_df.rename(columns={'address': 'recipient', 'actor': 'funder'})
        funder_df = funder_df[['recipient', 'funder', 'tx_hash', 'block_number', 'block_time', 'amount_bnb']]

        print(f"部署关系: {len(deploy_df)} 条")
        print(f"资助关系: {len(funder_df)} 条")

        return deploy_df, funder_df

    except Exception as e:
        print(f"查询失败: {e}")
        return pd.DataFrame(), pd.DataFrame()


def test_get_deployer_funder():
    """测试函数"""
    # 测试地址列表（包含一些知名BSC合约地址）
    test_addresses = [
        "0x55d398326f99059ff775485246999027b3197955",  # USDT BSC
        "0xe9e7cea3dedca5984780bafc599bd69add087d56",  # BUSD
        "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",  # USDC BSC
    ]

    print("测试 get_deployer_funder 函数...")
    print(f"测试地址: {test_addresses}")

    try:
        deploy_df, funder_df = get_deployer_funder(test_addresses)

        print(f"\n部署关系 DataFrame 形状: {deploy_df.shape}")
        if not deploy_df.empty:
            print("部署关系数据:")
            print(deploy_df.head())

        print(f"\n资助者 DataFrame 形状: {funder_df.shape}")
        if not funder_df.empty:
            print("资助者数据:")
            print(funder_df.head())

        return True

    except Exception as e:
        print(f"测试失败: {e}")
        return False


if __name__ == "__main__":
    test_get_deployer_funder()

import os
import sys
import argparse

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from database import get_db_session
from models import Merchant, ApiKey
from auth import generate_api_key


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True)
    parser.add_argument("--email", default=None)
    parser.add_argument("--quota", type=int, default=100)
    parser.add_argument("--cost", type=int, default=1)
    parser.add_argument("--max-concurrent", type=int, default=5)
    parser.add_argument("--rate-limit", type=int, default=60)
    args = parser.parse_args()

    with get_db_session() as db:
        merchant = Merchant(
            name=args.name,
            email=args.email,
            quota_total=args.quota,
            cost_per_task=args.cost,
            max_concurrent_tasks=args.max_concurrent,
            rate_limit_per_minute=args.rate_limit,
        )
        db.add(merchant)
        db.flush()

        raw_key, key_hash, prefix = generate_api_key()
        api_key = ApiKey(
            merchant_id=merchant.id,
            key_hash=key_hash,
            key_prefix=prefix,
            name="default",
        )
        db.add(api_key)
        db.flush()

        print("=" * 60)
        print("Merchant created")
        print("merchant_id:", merchant.id)
        print("name:", merchant.name)
        print("api_key:", raw_key)
        print("key_prefix:", prefix)
        print("=" * 60)


if __name__ == "__main__":
    main()
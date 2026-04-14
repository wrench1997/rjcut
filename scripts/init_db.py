# import os
# import sys

# sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# from database import engine, Base
# import models  # noqa


# def main():
#     Base.metadata.create_all(bind=engine)
#     print("database tables created.")


# if __name__ == "__main__":
#     main()


# scripts/init_db.py
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from alembic.config import Config
from alembic import command
import logging

logging.basicConfig(level=logging.INFO)

def main():
    # 使用 Alembic 运行迁移
    alembic_cfg = Config(os.path.join(os.path.dirname(__file__), '..', 'alembic.ini'))
    command.upgrade(alembic_cfg, "head")
    print("Database migrations applied successfully.")

if __name__ == "__main__":
    main()
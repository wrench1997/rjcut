import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from database import engine, Base
import models  # noqa


def main():
    Base.metadata.create_all(bind=engine)
    print("database tables created.")


if __name__ == "__main__":
    main()
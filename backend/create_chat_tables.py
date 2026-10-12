from app.database import engine
from app.models import Base, Conversation, Message


def main():
    print("Creating chat history tables...")

    Base.metadata.create_all(
        bind=engine,
        tables=[
            Conversation.__table__,
            Message.__table__,
        ],
    )

    print("Chat history tables are ready!")


if __name__ == "__main__":
    main()

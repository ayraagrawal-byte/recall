
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import SessionLocal
from app.models import Conversation, Message, utc_now


router = APIRouter(
    prefix="/api/v1/conversations",
    tags=["Conversations"],
)


class SaveExchangeRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    answer: str = Field(min_length=1)
    citations: list[dict] = Field(default_factory=list)


def serialize_message(message):
    return {
        "id": message.id,
        "role": message.role,
        "content": message.content,
        "citations": message.citations,
        "created_at": message.created_at,
    }


def serialize_conversation(conversation):
    return {
        "id": conversation.id,
        "title": conversation.title,
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
    }


@router.post("")
def create_conversation():
    with SessionLocal() as db:
        conversation = Conversation(
            title="New conversation"
        )

        db.add(conversation)
        db.commit()
        db.refresh(conversation)

        return serialize_conversation(conversation)


@router.get("")
def list_conversations():
    with SessionLocal() as db:
        conversations = (
            db.execute(
                select(Conversation).order_by(
                    Conversation.updated_at.desc(),
                    Conversation.id.desc(),
                )
            )
            .scalars()
            .all()
        )

        return [
            serialize_conversation(conversation)
            for conversation in conversations
        ]


@router.get("/{conversation_id}")
def get_conversation(conversation_id: int):
    with SessionLocal() as db:
        conversation = db.scalar(
            select(Conversation)
            .options(
                selectinload(Conversation.messages)
            )
            .where(Conversation.id == conversation_id)
        )

        if conversation is None:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found.",
            )

        return {
            **serialize_conversation(conversation),
            "messages": [
                serialize_message(message)
                for message in conversation.messages
            ],
        }


@router.post("/{conversation_id}/messages")
def save_exchange(
    conversation_id: int,
    request: SaveExchangeRequest,
):
    question = request.question.strip()
    answer = request.answer.strip()

    if not question or not answer:
        raise HTTPException(
            status_code=400,
            detail="Question and answer cannot be empty.",
        )

    with SessionLocal() as db:
        conversation = db.get(
            Conversation,
            conversation_id,
        )

        if conversation is None:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found.",
            )

        # Check for existing messages BEFORE adding
        # the new exchange to the session.
        #
        # This prevents SQLAlchemy's autoflush from
        # making the new messages appear in the query.
        existing_message = db.scalar(
            select(Message.id)
            .where(
                Message.conversation_id == conversation_id
            )
            .limit(1)
        )

        # Use the first question as the conversation title.
        if (
            conversation.title == "New conversation"
            and existing_message is None
        ):
            conversation.title = question[:255]

        user_message = Message(
            conversation_id=conversation_id,
            role="user",
            content=question,
            citations=[],
        )

        assistant_message = Message(
            conversation_id=conversation_id,
            role="assistant",
            content=answer,
            citations=request.citations,
        )

        db.add_all([
            user_message,
            assistant_message,
        ])

        # Move this conversation to the top of the list.
        conversation.updated_at = utc_now()

        db.commit()
        db.refresh(user_message)
        db.refresh(assistant_message)

        return {
            "status": "saved",
            "conversation_id": conversation_id,
            "messages": [
                serialize_message(user_message),
                serialize_message(assistant_message),
            ],
        }


@router.delete("/{conversation_id}")
def delete_conversation(conversation_id: int):
    with SessionLocal() as db:
        conversation = db.get(
            Conversation,
            conversation_id,
        )

        if conversation is None:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found.",
            )

        db.delete(conversation)
        db.commit()

        return {
            "status": "deleted",
            "conversation_id": conversation_id,
        }

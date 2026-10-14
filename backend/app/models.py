

from datetime import datetime, timezone



from pgvector.sqlalchemy import Vector

from sqlalchemy import ForeignKey, String, Text, JSON, Table, Column

from sqlalchemy.orm import (

    DeclarativeBase,

    Mapped,

    mapped_column,

    relationship,

)





def utc_now():

    return datetime.now(timezone.utc).replace(tzinfo=None)





class Base(DeclarativeBase):

    pass





collection_documents = Table(

    "collection_documents",

    Base.metadata,

    Column(

        "collection_id",

        ForeignKey("collections.id", ondelete="CASCADE"),

        primary_key=True,

    ),

    Column(

        "document_id",

        ForeignKey("documents.id", ondelete="CASCADE"),

        primary_key=True,

    ),

)





class Collection(Base):

    __tablename__ = "collections"



    id: Mapped[int] = mapped_column(primary_key=True)



    name: Mapped[str] = mapped_column(

        String(255),

        nullable=False,

    )



    description: Mapped[str | None] = mapped_column(

        Text,

        nullable=True,

    )



    created_at: Mapped[datetime] = mapped_column(

        default=utc_now,

    )



    documents: Mapped[list["Document"]] = relationship(

        secondary=collection_documents,

        back_populates="collections",

    )





class Document(Base):

    __tablename__ = "documents"



    id: Mapped[int] = mapped_column(primary_key=True)

    filename: Mapped[str] = mapped_column(String(255))

    created_at: Mapped[datetime] = mapped_column(

        default=datetime.utcnow

    )



    collections: Mapped[list["Collection"]] = relationship(

        secondary=collection_documents,

        back_populates="documents",

    )



    chunks: Mapped[list["Chunk"]] = relationship(

        back_populates="document",

        cascade="all, delete-orphan",

    )





class Chunk(Base):

    __tablename__ = "chunks"



    id: Mapped[int] = mapped_column(primary_key=True)



    document_id: Mapped[int] = mapped_column(

        ForeignKey("documents.id")

    )



    content: Mapped[str] = mapped_column(Text)



    page_number: Mapped[int | None] = mapped_column(

        nullable=True

    )



    embedding: Mapped[list[float] | None] = mapped_column(

        Vector(384),

        nullable=True

    )



    document: Mapped["Document"] = relationship(

        back_populates="chunks"

    )





class Conversation(Base):

    __tablename__ = "conversations"



    id: Mapped[int] = mapped_column(primary_key=True)



    title: Mapped[str] = mapped_column(

        String(255),

        default="New conversation",

    )



    created_at: Mapped[datetime] = mapped_column(

        default=utc_now,

    )



    updated_at: Mapped[datetime] = mapped_column(

        default=utc_now,

        onupdate=utc_now,

    )



    messages: Mapped[list["Message"]] = relationship(

        back_populates="conversation",

        cascade="all, delete-orphan",

        order_by="Message.id",

    )





class Message(Base):

    __tablename__ = "messages"



    id: Mapped[int] = mapped_column(primary_key=True)



    conversation_id: Mapped[int] = mapped_column(

        ForeignKey("conversations.id"),

        index=True,

    )



    role: Mapped[str] = mapped_column(

        String(20),

        nullable=False,

    )



    content: Mapped[str] = mapped_column(

        Text,

        nullable=False,

    )



    citations: Mapped[list] = mapped_column(

        JSON,

        default=list,

        nullable=False,

    )



    created_at: Mapped[datetime] = mapped_column(

        default=utc_now,

    )



    conversation: Mapped["Conversation"] = relationship(

        back_populates="messages"

    )





class ResearchNote(Base):

    __tablename__ = "research_notes"



    id: Mapped[int] = mapped_column(primary_key=True)



    document_id: Mapped[int] = mapped_column(

        ForeignKey("documents.id", ondelete="RESTRICT"),

        nullable=False,

        index=True,

    )



    collection_id: Mapped[int | None] = mapped_column(

        ForeignKey("collections.id", ondelete="SET NULL"),

        nullable=True,

        index=True,

    )



    page_number: Mapped[int | None] = mapped_column(

        nullable=True,

    )



    title: Mapped[str] = mapped_column(

        String(255),

        nullable=False,

    )



    content: Mapped[str] = mapped_column(

        Text,

        nullable=False,

    )



    created_at: Mapped[datetime] = mapped_column(

        default=utc_now,

        nullable=False,

    )



    updated_at: Mapped[datetime] = mapped_column(

        default=utc_now,

        onupdate=utc_now,

        nullable=False,

    )


class CitationBookmark(Base):
    __tablename__ = "citation_bookmarks"

    id: Mapped[int] = mapped_column(primary_key=True)

    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    collection_id: Mapped[int | None] = mapped_column(
        ForeignKey("collections.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    page_number: Mapped[int | None] = mapped_column(
        nullable=True,
    )

    evidence: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    label: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        default=utc_now,
        nullable=False,
    )

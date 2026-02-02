from typing import List
from sqlalchemy import select, and_, or_
from app.dao.base import BaseDAO
from app.chat.models import Message
from app.database import async_session_maker


class MessagesDAO(BaseDAO):
    model = Message

    @classmethod
    async def get_messages_between_users(cls, user_id_1: int, user_id_2: int):
        # Асинхронно находит и возвращает все сообщения между двумя пользователями.
        async with async_session_maker() as session:
            query = select(cls.model).filter(
                or_(
                    and_(cls.model.sender_id == user_id_1, cls.model.recipient_id == user_id_2),
                    and_(cls.model.sender_id == user_id_2, cls.model.recipient_id == user_id_1)
                )
            ).order_by(cls.model.id)
            result = await session.execute(query)
            return result.scalars().all()

    # Асинхронно находит и возвращает все сообщения пользователей в общий чат.
    @classmethod
    async def get_all_global_messages(cls) -> List[Message]:
        async with async_session_maker() as session:
            query = select(cls.model).where(cls.model.recipient_id == 0).order_by(cls.model.id)
            result = await session.execute(query)
            return result.scalars().all()

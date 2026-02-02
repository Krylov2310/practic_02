from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from typing import List, Dict
from app.chat.dao import MessagesDAO
from app.chat.schemas import MessageRead, MessageCreate
from app.users.dao import UsersDAO
from app.users.dependencies import get_current_user
from app.users.models import User
import asyncio
import json
import logging

# Создаем экземпляр маршрутизатора с префиксом /chat и тегом "Chat"
router = APIRouter(prefix='/chat', tags=['Chat'])
# Настройка шаблонов Jinja2
templates = Jinja2Templates(directory='app/templates')


# Страница чата
@router.get('/', response_class=HTMLResponse, summary='Chat Page')
async def get_chat_page(request: Request, user_data: User = Depends(get_current_user)):
    # Получаем всех пользователей из базы данных
    users_all = await UsersDAO.find_all()
    # Возвращаем HTML-страницу с использованием шаблона Jinja2
    return templates.TemplateResponse('chat.html',
                                      {'request': request, 'user': user_data, 'users_all': users_all})


# Активные WebSocket-подключения: {user_id: websocket}
active_connections: Dict[int, WebSocket] = {}


# Функция для отправки сообщения пользователю, если он подключен
async def notify_user(user_id: int, message: dict):
    # Отправить сообщение пользователю
    if user_id in active_connections:
        websocket = active_connections[user_id]
        # Отправляем сообщение в формате JSON
        await websocket.send_json(message)


# WebSocket эндпоинт для соединений
@router.websocket('/ws/{user_id}')
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    # Принимаем WebSocket-соединение
    await websocket.accept()
    # Сохраняем активное соединение для пользователя
    active_connections[user_id] = websocket
    try:
        while True:
            # Просто поддерживаем соединение активным (1 секунда паузы)
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        # Удаляем пользователя из активных соединений при отключении
        active_connections.pop(user_id, None)


# Получение сообщений между двумя пользователями
@router.get('/messages/{user_id}', response_model=List[MessageRead])
async def get_messages(user_id: int, current_user: User = Depends(get_current_user)):
    # Возвращает сообщения общего чата
    if user_id == 0:
        return await MessagesDAO.get_all_global_messages() or []
    # Возвращаем список сообщений между текущим пользователем и другим пользователем
    return await MessagesDAO.get_messages_between_users(user_id_1=user_id, user_id_2=current_user.id) or []


# Отправка сообщения от текущего пользователя
@router.post('/messages', response_model=MessageCreate)
async def send_message(message: MessageCreate, current_user: User = Depends(get_current_user)):
    html_content = (f'<div class="message-header">'
                    f'<span class="sender-name">{current_user.name}</span>'
                    f'<span class="message-time">{current_user.created_at}</span>'
                    f'</div>'
                    f'<div class="message-content">{message.content}</div>')
    await MessagesDAO.add(
        sender_id=current_user.id,
        content=html_content,
        recipient_id=message.recipient_id
    )
    message_data = {
        'sender_id': current_user.id,
        'recipient_id': message.recipient_id,
        'content': message.content,
    }

    # Уведомляем получателя и отправителя через WebSocket
    await notify_user(message.recipient_id, message_data)
    await notify_user(current_user.id, message_data)

    # Возвращаем подтверждение сохранения сообщения
    return {'recipient_id': message.recipient_id, 'content': message.content, 'status': 'ok', 'msg': 'Message saved!'}

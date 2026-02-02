// Сохраняем текущий выбранный userId и WebSocket соединение
let selectedUserId = null;
let socket = null;
let messagePollingInterval = null;

// Функция выхода из аккаунта
async function logout() {
    try {
        const response = await fetch('/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });

        if (response.ok) {
            window.location.href = '/auth';
        } else {
            console.error('Ошибка при выходе');
        }
    } catch (error) {
        console.error('Ошибка при выполнении запроса:', error);
    }
}

// Функция выбора пользователя
async function selectUser(userId, userName, event) {
    selectedUserId = userId;
    document.getElementById('chatHeader').innerHTML = `<span>Чат с ${userName}</span><button class="logout-button" id="logoutButton">Выход</button>`;
    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendButton').disabled = false;

    document.querySelectorAll('.user-item').forEach(item => item.classList.remove('active'));
    event.target.classList.add('active');

    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = '';
    messagesContainer.style.display = 'block';

    document.getElementById('logoutButton').onclick = logout;

    await loadMessages(userId);
    connectWebSocket();
    startMessagePolling(userId);
}

// Загрузка сообщений
async function loadMessages(userId) {
    try {
        // Для общего чата (ID = 0) запрашиваем особый endpoint
        const url = userId === '0'
            ? `/chat/messages/global`  // Например, /chat/messages/global
            : `/chat/messages/${userId}`;

        const response = await fetch(url);
        const messages = await response.json();

        const messagesContainer = document.getElementById('messages');
        messagesContainer.innerHTML = messages.map(message =>
            createMessageElement(
                message.content,
                message.sender_id,
                message.recipient_id,
                message.created_at
            )
        ).join('');
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
    }
}
async function loadMessages(userId) {
    try {
        const response = await fetch(`/chat/messages/${userId}`);
        const messages = await response.json();

        const messagesContainer = document.getElementById('messages');
        messagesContainer.innerHTML = messages.map(message =>
            createMessageElement(
                message.content,
                message.sender_id,      // добавляем sender_id
                message.recipient_id,
                message.created_at       // добавляем timestamp
            )
        ).join('');
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
    }
}

async function loadGlobalChatPreview() {
    const globalMessagesContainer = document.getElementById('globalMessages');
    globalMessagesContainer.innerHTML = ''; // Очищаем перед обновлением

    try {
        // Запрос к endpoint, возвращающему последние сообщения общего чата
        const response = await fetch('/chat/messages/global?limit=5');
        const messages = await response.json();

        if (messages.length === 0) {
            globalMessagesContainer.innerHTML = '<div class="no-messages">Нет сообщений</div>';
            return;
        }

        // Формируем HTML для каждого сообщения
        messages.forEach(message => {
            const messageDiv = document.createElement('div');
            messageDiv.classList.add('global-message-preview');

            // Получаем имя отправителя
            const senderName = getUserNameById(message.sender_id) || 'Неизвестный';

            messageDiv.innerHTML = `
                <div class="message-sender">${senderName}</div>
                <div class="message-text">${message.content}</div>
                <div class="message-time">${new Date(message.created_at).toLocaleTimeString()}</div>
            `;

            globalMessagesContainer.appendChild(messageDiv);
        });
    } catch (error) {
        console.error('Ошибка при загрузке сообщений общего чата:', error);
        globalMessagesContainer.innerHTML = '<div class="error">Ошибка загрузки</div>';
    }
}

// Подключение WebSocket
function connectWebSocket() {
    if (socket) socket.close();

    socket = new WebSocket(`wss://${window.location.host}/chat/ws/${selectedUserId}`);

    socket.onopen = () => console.log('WebSocket соединение установлено');

    socket.onmessage = (event) => {
    const incomingMessage = JSON.parse(event.data);

    // Если текущий чат — общий (ID = 0), показываем все сообщения для общего чата
    if (incomingMessage.recipient_id === selectedUserId) {
        addMessage(
        incomingMessage.content,
        incomingMessage.sender_id,
        incomingMessage.recipient_id,
        incomingMessage.created_at  // передаём время
        );
        }
    };

    socket.onclose = () => console.log('WebSocket соединение закрыто');
}

// Отправка сообщения
async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();

    if (message && selectedUserId) {
        const payload = {
            recipient_id: selectedUserId,
            content: message,
            created_at: new Date().toISOString()  // добавляем время
        };

        try {
            await fetch('/chat/messages', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });

            socket.send(JSON.stringify(payload));
            addMessage(message, currentUserId, selectedUserId, payload.created_at);
            messageInput.value = '';
        } catch (error) {
            console.error('Ошибка при отправке сообщения:', error);
        }
    }
}

function addMessage(text, sender_id, recipient_id, timestamp = new Date()) {
    const messagesContainer = document.getElementById('messages');
    messagesContainer.insertAdjacentHTML('beforeend',
        createMessageElement(text, sender_id, recipient_id, timestamp)
    );
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Создание HTML элемента сообщения
function createMessageElement(text, sender_id, recipient_id) {
    const userID = parseInt(selectedUserId, 10);
    const messageClass = userID === recipient_id ? 'my-message' : 'other-message';
    return `<div class="message ${messageClass}">${text}</div>`;
}

// Вспомогательная функция: получить имя пользователя по ID
function getUserNameById(userId) {
  // Здесь можно кэшировать список пользователей или брать из глобального массива
  const user = usersList.find(u => u.id === userId);
  return user ? user.name : null;
}

// Вспомогательная функция: получить имя пользователя по Name
function getUserNameByName(userName) {
  // Здесь можно кэшировать список пользователей или брать из глобального массива
  const user = usersList.find(u => u.name === userName);
  return user ? user.name : null;
}


// Запуск опроса новых сообщений
function startMessagePolling(userId) {
    clearInterval(messagePollingInterval);
    messagePollingInterval = setInterval(() => loadMessages(userId), 1000);
}

// Обработка нажатий на пользователя
function addUserClickListeners() {
    document.querySelectorAll('.user-item').forEach(item => {
        item.onclick = event => selectUser(item.getAttribute('data-user-id'), item.textContent, event);
    });
}

// Первоначальная настройка событий нажатия на пользователей
addUserClickListeners();

// Обновление списка пользователей
async function fetchUsers() {
    try {
        const response = await fetch('/auth/users');
        const users = await response.json();
        const userList = document.getElementById('userList');

        // Очищаем текущий список пользователей
        userList.innerHTML = '';

        // Создаем элемент "Личные заметки" для текущего пользователя
        const favoriteElement = document.createElement('div');
        favoriteElement.classList.add('user-item');
        favoriteElement.setAttribute('data-user-id', currentUserId);
        favoriteElement.textContent = 'Личные заметки';

        // 2. Добавляем "Общий чат" (ID = 0)
        const globalChatElement = document.createElement('div');
        globalChatElement.classList.add('user-item');
        globalChatElement.setAttribute('data-user-id', '0');  // Фиксированный ID = 0
        globalChatElement.textContent = 'Общий чат';  // Или "Все пользователи", "Группа" и т.п.
        userList.appendChild(globalChatElement);

        // Вызовы
        document.addEventListener('DOMContentLoaded', fetchUsers);
        setInterval(fetchUsers, 10000); // Обновление каждые 10 секунд

        // Добавляем "Личные заметки" в начало списка
        userList.appendChild(favoriteElement);
//        userList.appendChild(globalChatElement);

        // Генерация списка остальных пользователей
        users.forEach(user => {
            if (user.id !== currentUserId) {
                const userElement = document.createElement('div');
                userElement.classList.add('user-item');
                userElement.setAttribute('data-user-id', user.id);
                userElement.textContent = user.name;
                userList.appendChild(userElement);
            }
        });

        // Повторно добавляем обработчики событий для каждого пользователя
        addUserClickListeners();
    } catch (error) {
        console.error('Ошибка при загрузке списка пользователей:', error);
    }
}


document.addEventListener('DOMContentLoaded', fetchUsers);
setInterval(fetchUsers, 10000); // Обновление каждые 10 секунд

// Обработчики для кнопки отправки и ввода сообщения
document.getElementById('sendButton').onclick = sendMessage;

document.getElementById('messageInput').onkeypress = async (e) => {
    if (e.key === 'Enter') {
        await sendMessage();
    }
};

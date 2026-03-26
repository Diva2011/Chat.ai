// 🔥 Firebase initialization
try {
    firebase.initializeApp(window.firebaseConfig);
    window.db = firebase.firestore();
    document.getElementById('firebase-status').textContent = '✅ Connected';
    document.getElementById('firebase-status').style.color = '#27ae60';
    console.log('✅ Firebase connected!');
} catch (error) {
    console.error('Firebase error:', error);
    document.getElementById('firebase-status').textContent = '❌ Config missing';
    document.getElementById('firebase-status').style.color = '#e74c3c';
}

class FirebaseChat {
    constructor() {
        this.currentUser = null;
        this.roomId = 'two-person-chat-room-v1';
        this.typingTimer = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkExistingUser();
    }

    bindEvents() {
        // User selection buttons
        document.getElementById('user1-btn').addEventListener('click', () => this.selectUser('User1'));
        document.getElementById('user2-btn').addEventListener('click', () => this.selectUser('User2'));
        
        // Send button - FIXED
        document.getElementById('send-btn').addEventListener('click', (e) => {
            e.preventDefault();
            this.sendMessage();
        });
        
        // Enter key
        document.getElementById('message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Typing + send button state
        document.getElementById('message-input').addEventListener('input', (e) => {
            this.updateSendButton();
            this.handleTyping(e.target.value);
        });
        
        // Clear chat
        document.getElementById('clear-btn').addEventListener('click', () => this.clearChat());
    }

    updateSendButton() {
        const input = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');
        const hasText = input.value.trim().length > 0;
        const userSelected = !!this.currentUser;
        
        sendBtn.disabled = !(hasText && userSelected);
        sendBtn.style.opacity = sendBtn.disabled ? '0.5' : '1';
    }

    checkExistingUser() {
        const savedUser = localStorage.getItem('chatUser');
        const savedName = localStorage.getItem('chatName');
        if (savedUser && savedName && window.db) {
            this.currentUser = savedUser;
            document.getElementById('current-user').textContent = savedName;
            document.getElementById('user-selection').style.display = 'none';
            document.getElementById('chat-container').style.display = 'flex';
            document.getElementById('message-input').focus();
            this.listenForMessages();
            console.log('✅ Reconnected as:', savedName);
        }
    }

    selectUser(userType) {
        const input = document.getElementById('username-input');
        const username = input.value.trim() || `${userType} (${userType === 'User1' ? 'Blue' : 'Green'})`;
        
        if (!window.db) {
            alert('❌ Firebase not connected! Check config in index.html');
            return;
        }

        this.currentUser = userType;
        document.getElementById('current-user').textContent = username;
        
        localStorage.setItem('chatUser', userType);
        localStorage.setItem('chatName', username);
        
        document.getElementById('user-selection').style.display = 'none';
        document.getElementById('chat-container').style.display = 'flex';
        document.getElementById('message-input').focus();
        
        input.value = '';
        this.listenForMessages();
        console.log('✅ Joined as:', username);
    }

    async sendMessage() {
        const input = document.getElementById('message-input');
        const text = input.value.trim();
        
        console.log('Send attempt:', text); // Debug
        
        if (!text || !this.currentUser || !window.db) {
            console.log('Send blocked - missing:', {text: !!text, user: !!this.currentUser, db: !!window.db});
            return;
        }

        const messageText = text;
        input.value = '';
        this.updateSendButton();

        try {
            const message = {
                user: this.currentUser,
                username: localStorage.getItem('chatName'),
                text: messageText,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                roomId: this.roomId
            };
            
            await window.db.collection('messages').add(message);
            console.log('✅ Message sent!');
            this.clearTyping();
        } catch (error) {
            console.error('Send error:', error);
            alert('Failed to send: ' + error.message);
            input.value = messageText; // Restore message
            this.updateSendButton();
        }
    }

    handleTyping(text) {
        clearTimeout(this.typingTimer);
        
        if (text.length > 0 && this.currentUser && window.db) {
            this.sendTypingStatus(true);
            this.typingTimer = setTimeout(() => {
                this.clearTyping();
            }, 2000);
        } else {
            this.clearTyping();
        }
    }

    async sendTypingStatus(isTyping) {
        if (!window.db) return;
        try {
            await window.db.collection('typing').doc(this.currentUser).set({
                user: this.currentUser,
                username: localStorage.getItem('chatName'),
                isTyping: isTyping,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (e) {
            // Silent
        }
    }

    async clearTyping() {
        if (!window.db || !this.currentUser) return;
        try {
            await window.db.collection('typing').doc(this.currentUser).delete();
        } catch (e) {
            // Silent
        }
    }

    async clearChat() {
        if (!confirm('Clear ALL messages?')) return;
        
        if (!window.db) {
            alert('No database connection');
            return;
        }
        
        try {
            const snapshot = await window.db.collection('messages')
                .where('roomId', '==', this.roomId).get();
            const batch = window.db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log('✅ Chat cleared');
        } catch (error) {
            console.error('Clear error:', error);
        }
    }

    listenForMessages() {
        if (!window.db) return;

        // Messages listener
        window.db.collection('messages')
            .where('roomId', '==', this.roomId)
            .orderBy('timestamp')
            .onSnapshot(snapshot => {
                const messages = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.timestamp) {
                        messages.push({
                            ...data,
                            timestamp: data.timestamp.toDate ? data.timestamp.toDate() : new Date()
                        });
                    }
                });
                this.renderMessages(messages);
            });

        // Typing listener
        window.db.collection('typing')
            .where('isTyping', '==', true)
            .onSnapshot(snapshot => {
                let typingUser = null;
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.user !== this.currentUser) {
                        typingUser = data;
                    }
                });
                if (typingUser) {
                    document.getElementById('typing-indicator').textContent = `${typingUser.username} is typing...`;
                    document.getElementById('typing-indicator').style.display = 'block';
                } else {
                    document.getElementById('typing-indicator').style.display = 'none';
                }
            });
    }

    renderMessages(messages) {
        const container = document.getElementById('messages');
        container.innerHTML = '';

        messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = `message ${msg.user.toLowerCase()}`;
            
            const time = msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
            
            div.innerHTML = `
                <div class="message-avatar">${msg.username.charAt(0)?.toUpperCase()}</div>
                <div class="message-content">
                    <div class="message-bubble">${this.escapeHtml(msg.text)}</div>
                    <div class="message-time">${time}</div>
                </div>
            `;
            container.appendChild(div);
        });

        container.scrollTop = container.scrollHeight;
        this.updateStatus(messages);
    }

    updateStatus(messages) {
        const statusEl = document.getElementById('connection-status');
        const recentMsg = messages[messages.length - 1];
        
        if (recentMsg && recentMsg.user !== this.currentUser) {
            statusEl.textContent = '🟢 Live chat!';
            statusEl.className = 'status connected';
        } else {
            statusEl.textContent = '🟡 Waiting for friend...';
            statusEl.className = 'status waiting';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 🔥 Initialize when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new FirebaseChat();
    });
} else {
    new FirebaseChat();
}
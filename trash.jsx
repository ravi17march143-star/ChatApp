(function() {
    // helper utilities
    function qs(selector) {
        try {
            return document.querySelector(selector);
        } catch (e) {
            return null;
        }
    }

    function qsa(selector) {
        try {
            return Array.from(document.querySelectorAll(selector));
        } catch (e) {
            return [];
        }
    }

    function timeNow() {
        const d = new Date();
        return d.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function escapeHtml(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>\"]/g, function(c) {
            return ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;'
            } [c] || c);
        });
    }

    // elements
    var chatListEl = qs('#chatList');
    var messagesEl = qs('#messages');
    var convNameEl = qs('#convName');
    var convAvatarEl = qs('#convAvatar');
    var convStatusEl = qs('#convStatus');
    var searchInput = qs('#searchInput');
    var msgInput = qs('#msgInput');
    var sendBtn = qs('#sendBtn');
    var attachBtn = qs('#attachBtn');
    var fileInput = qs('#fileInput');
    var emojiBtn = qs('#emojiBtn');
    var emojiPicker = qs('#emojiPicker');
    var replyPreview = qs('#replyPreview');
    var replyText = qs('#replyText');
    var cancelReply = qs('#cancelReply');
    var attachPreview = qs('#attachPreview');
    var permissionNotice = qs('#permissionNotice');

    // state
    var chats = [{
            id: 1,
            name: 'Aman',
            avatar: 'A',
            status: 'online',
            typing: false,
            messages: [{
                id: 1,
                type: 'in',
                text: 'Hello Ravi!',
                time: '10:00',
                status: 'seen'
            }, {
                id: 2,
                type: 'out',
                text: 'Hi Aman!',
                time: '10:02',
                status: 'seen'
            }]
        },
        {
            id: 2,
            name: 'Mom',
            avatar: 'M',
            status: 'online',
            typing: false,
            messages: [{
                id: 1,
                type: 'in',
                text: 'Khana tayyar hai',
                time: '09:15',
                status: 'delivered'
            }]
        },
        {
            id: 3,
            name: 'Design Team',
            avatar: 'D',
            status: 'online',
            typing: false,
            messages: [{
                id: 1,
                type: 'in',
                text: 'Meeting at 5PM',
                time: '11:30',
                status: 'delivered'
            }]
        }
    ];
    var activeChat = null;
    var msgIdCounter = 300;
    var selectedMessageId = null;
    var typingTimers = {};
    var stagedAttachments = [];

    function safe(fn) {
        return function() {
            try {
                return fn.apply(this, arguments);
            } catch (err) {
                console.error('Handler error', err);
            }
        };
    }

    function renderChatList(filter) {
        if (!chatListEl) return;
        chatListEl.innerHTML = '';
        var list = chats.filter(function(c) {
            return (c.name || '').toLowerCase().indexOf((filter || '').toLowerCase()) !== -1;
        });
        list.forEach(function(c) {
            var item = document.createElement('div');
            item.className = 'chat-item';
            if (activeChat && activeChat.id === c.id) item.classList.add('active');
            var last = (Array.isArray(c.messages) && c.messages.length > 0) ? c.messages[c.messages.length - 1].text : 'No messages';
            item.innerHTML = '<div style="width:48px;height:48px;border-radius:50%;background:#cfe8ff;display:flex;align-items:center;justify-content:center;font-weight:700">' + escapeHtml(c.avatar) + '</div>' +
                '<div class="meta"><div class="name">' + escapeHtml(c.name) + '</div><div class="last">' + escapeHtml(last) + '</div></div>';
            if (c.typing) {
                var t = document.createElement('div');
                t.className = 'typing';
                t.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span> typing...';
                var meta = item.querySelector('.meta');
                if (meta) meta.appendChild(t);
            }
            item.addEventListener('click', safe(function() {
                if (emojiPicker) emojiPicker.style.display = 'none';
                openChat(c.id);
            }));
            chatListEl.appendChild(item);
        });
        if (list.length === 0) chatListEl.innerHTML = '<div style="padding:12px;color:var(--muted)">No chats</div>';
    }

    function openChat(id) {
        var found = chats.find(function(x) {
            return x && x.id === id;
        });
        if (!found) return;
        activeChat = found;
        if (convNameEl) convNameEl.textContent = activeChat.name || 'Unknown';
        if (convAvatarEl) convAvatarEl.textContent = activeChat.avatar || '?';
        if (convStatusEl) convStatusEl.textContent = activeChat.status || '';
        renderChatList(searchInput ? (searchInput.value || '') : '');
        selectedMessageId = null;
        hideReplyPreview();
        renderMessages();
        markAllAsSeen(activeChat);
    }

    function renderMessages() {
        if (!messagesEl) return;
        messagesEl.innerHTML = '';
        if (!activeChat) {
            messagesEl.innerHTML = '<div class="empty muted">No chat selected — choose a chat on the left</div>';
            return;
        }
        var msgs = Array.isArray(activeChat.messages) ? activeChat.messages : [];
        msgs.forEach(function(m) {
            var row = document.createElement('div');
            row.className = 'message-row ' + (m.type === 'out' ? 'out' : 'in');
            var bubble = document.createElement('div');
            bubble.className = 'bubble ' + (m.type === 'out' ? 'out' : 'in');
            bubble.dataset.msgid = m.id;

            if (m.reply && typeof m.reply === 'object') {
                var q = document.createElement('div');
                q.className = 'msg-quote';
                q.textContent = (m.reply.text || m.reply.name || '[attachment]');
                bubble.appendChild(q);
            }

            if (m.kind === 'file' && m.file) {
                // support multiple attached files (file array)
                if (Array.isArray(m.file)) {
                    m.file.forEach(function(f) {
                        appendFilePreviewToBubble(f, bubble);
                    });
                    if (m.text) {
                        var t = document.createElement('div');
                        t.style.marginTop = '6px';
                        t.textContent = m.text;
                        bubble.appendChild(t);
                    }
                } else {
                    appendFilePreviewToBubble(m.file, bubble);
                    if (m.text) {
                        var t2 = document.createElement('div');
                        t2.style.marginTop = '6px';
                        t2.textContent = m.text;
                        bubble.appendChild(t2);
                    }
                }
            } else {
                var content = document.createElement('div');
                content.className = 'msg-content';
                content.textContent = m.text || '';
                bubble.appendChild(content);
            }

            var meta = document.createElement('div');
            meta.className = 'time';
            meta.textContent = m.time || '';

            if (m.type === 'out') {
                var ticks = document.createElement('span');
                ticks.className = 'ticks';
                var t1 = document.createElement('span');
                t1.className = 'tick single';
                t1.textContent = '✓';
                var t2 = document.createElement('span');
                t2.className = 'tick double';
                t2.textContent = '✓';
                if (m.status === 'seen') t2.classList.add('seen');
                ticks.appendChild(t1);
                ticks.appendChild(t2);
                meta.appendChild(ticks);
            }

            bubble.appendChild(meta);
            bubble.addEventListener('click', safe(function(ev) {
                ev.stopPropagation();
                onSelectMessage(m.id, m);
            }));
            row.appendChild(bubble);
            messagesEl.appendChild(row);
        });

        try {
            messagesEl.scrollTop = messagesEl.scrollHeight;
        } catch (e) {
            /* ignore */ }
        updateSelectedUI();
        renderTypingIndicator();
    }

    function appendFilePreviewToBubble(f, bubble) {
        if (!f) return;
        if (f.kind === 'image') {
            var img = document.createElement('img');
            img.src = f.url;
            img.style.maxWidth = '240px';
            img.style.borderRadius = '8px';
            bubble.appendChild(img);
        } else if (f.kind === 'video') {
            var v = document.createElement('video');
            v.src = f.url;
            v.controls = true;
            v.style.maxWidth = '300px';
            v.style.borderRadius = '8px';
            bubble.appendChild(v);
        } else if (f.kind === 'audio') {
            var a = document.createElement('audio');
            a.src = f.url;
            a.controls = true;
            bubble.appendChild(a);
        } else {
            var aLink = document.createElement('a');
            aLink.href = f.url;
            aLink.target = '_blank';
            aLink.className = 'attachment-link';
            aLink.textContent = f.name || 'file';
            bubble.appendChild(aLink);
        }
    }

    function onSelectMessage(id, message) {
        try {
            if (selectedMessageId === id) {
                selectedMessageId = null;
                hideReplyPreview();
            } else {
                selectedMessageId = id;
                showReplyPreview(message);
            }
            updateSelectedUI();
        } catch (e) {
            console.error(e);
        }
    }

    function updateSelectedUI() {
        try {
            qsa('.bubble.selected').forEach(function(el) {
                el.classList.remove('selected');
            });
            if (selectedMessageId) {
                var el = document.querySelector('.bubble[data-msgid="' + selectedMessageId + '"]');
                if (el) el.classList.add('selected');
            }
        } catch (e) {
            console.error(e);
        }
    }

    function showReplyPreview(message) {
        if (!replyPreview || !replyText) return;
        replyText.textContent = (message && (message.text || message.name)) || '';
        replyPreview.classList.add('visible');
    }

    function hideReplyPreview() {
        if (!replyPreview) return;
        replyPreview.classList.remove('visible');
        if (replyText) replyText.textContent = '';
    }

    function clearAttachPreview() {
        try {
            stagedAttachments = [];
            if (attachPreview) attachPreview.innerHTML = '';
            if (attachPreview) attachPreview.style.display = 'none';
        } catch (e) {
            console.error(e);
        }
    }

    function renderAttachPreview() {
        try {
            if (!attachPreview) return;
            attachPreview.innerHTML = '';
            if (!stagedAttachments || stagedAttachments.length === 0) {
                attachPreview.style.display = 'none';
                return;
            }
            stagedAttachments.forEach(function(f, idx) {
                var it = document.createElement('div');
                it.className = 'attach-item';
                var name = document.createElement('div');
                name.textContent = f.name || 'file';
                name.style.fontSize = '13px';
                var rem = document.createElement('button');
                rem.className = 'small-btn';
                rem.textContent = '✖';
                rem.addEventListener('click', safe(function() {
                    stagedAttachments.splice(idx, 1);
                    renderAttachPreview();
                }));
                it.appendChild(name);
                it.appendChild(rem);
                attachPreview.appendChild(it);
            });
            attachPreview.style.display = 'flex';
        } catch (e) {
            console.error(e);
        }
    }

    function handleSend() {
        try {
            if (!activeChat) {
                alert('Select a chat first');
                return;
            }
            if (!msgInput) return;
            var text = (msgInput.value || '').trim();
            if (!text && stagedAttachments.length === 0) return;
            var msg = {
                id: ++msgIdCounter,
                type: 'out',
                text: text || '',
                time: timeNow(),
                status: 'sent'
            };
            if (selectedMessageId) {
                var orig = findMessageById(selectedMessageId);
                if (orig) msg.reply = {
                    id: orig.id,
                    text: orig.text
                };
                selectedMessageId = null;
                hideReplyPreview();
            }
            if (stagedAttachments.length > 0) {
                msg.kind = 'file';
                msg.file = JSON.parse(JSON.stringify(stagedAttachments));
                msg.file.forEach(function(f) {
                    if (!f.kind) f.kind = 'other';
                });
            }
            activeChat.messages.push(msg);
            msgInput.value = '';
            clearAttachPreview();
            renderMessages();
            renderChatList(searchInput ? (searchInput.value || '') : '');
            simulateDelivery(msg, activeChat);
        } catch (e) {
            console.error(e);
        }
    }

    function findMessageById(id) {
        if (!activeChat) return null;
        return (activeChat.messages || []).find(function(m) {
            return m.id === id;
        }) || null;
    }

    if (sendBtn) sendBtn.addEventListener('click', safe(handleSend));
    if (msgInput) msgInput.addEventListener('keydown', safe(function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSend();
        }
    }));

    if (attachBtn && fileInput) attachBtn.addEventListener('click', safe(function() {
        try {
            fileInput.click();
        } catch (e) {
            console.error(e);
        }
    }));
    if (fileInput) fileInput.addEventListener('change', safe(function(e) {
        try {
            var files = Array.from((e && e.target && e.target.files) || []);
            if (files.length === 0) return;
            if (!activeChat) {
                alert('Select a chat first');
                fileInput.value = '';
                return;
            }
            files.forEach(function(f) {
                var url = URL.createObjectURL(f);
                var kind = f.type ? (f.type.indexOf('image/') === 0 ? 'image' : (f.type.indexOf('video/') === 0 ? 'video' : (f.type.indexOf('audio/') === 0 ? 'audio' : 'other'))) : 'other';
                stagedAttachments.push({
                    name: f.name,
                    url: url,
                    kind: kind
                });
            });
            renderAttachPreview();
            fileInput.value = '';
        } catch (e) {
            console.error('attach change error', e);
        }
    }));

    var EMOJIS = ['😀', '😂', '😊', '😍', '👍', '🙏', '🔥', '😎', '🎉', '😅', '🤔', '😢', '😡', '🎁', '🌟', '✨', '💯'];
    if (emojiBtn && emojiPicker) {
        emojiBtn.addEventListener('click', safe(function() {
            emojiPicker.style.display = (emojiPicker.style.display === 'block') ? 'none' : 'block';
        }));
        EMOJIS.forEach(function(em) {
            try {
                var b = document.createElement('button');
                b.type = 'button';
                b.textContent = em;
                b.addEventListener('click', safe(function() {
                    if (msgInput) {
                        msgInput.value += em;
                        msgInput.focus();
                    }
                }));
                emojiPicker.appendChild(b);
            } catch (ex) {
                console.error(ex);
            }
        });
    }

    document.addEventListener('click', function(ev) {
        try {
            var insideEmoji = emojiPicker && emojiPicker.contains(ev.target);
            var isEmojiBtn = emojiBtn && emojiBtn.contains(ev.target);
            var insideAttach = attachPreview && attachPreview.contains(ev.target);
            var isAttachBtn = attachBtn && attachBtn.contains(ev.target);
            if (!insideEmoji && !isEmojiBtn) {
                if (emojiPicker) emojiPicker.style.display = 'none';
            }
            // keep attachPreview visible unless user clicked outside attachPreview and attachBtn
            if (!insideAttach && !isAttachBtn) {
                if (attachPreview) attachPreview.style.display = (stagedAttachments && stagedAttachments.length > 0) ? 'flex' : 'none';
            }
            // clicking elsewhere (like chat list) should close emoji picker and not break selected message
        } catch (e) {
            console.error(e);
        }
    });

    if (cancelReply) cancelReply.addEventListener('click', safe(function() {
        selectedMessageId = null;
        hideReplyPreview();
        updateSelectedUI();
    }));

    function simulateDelivery(msg, chat) {
        setTimeout(function() {
            try {
                msg.status = 'delivered';
                renderMessages();
                if (activeChat && activeChat.id === chat.id) {
                    markAllAsSeen(chat);
                }
            } catch (e) {
                console.error(e);
            }
        }, 600);
        setTimeout(function() {
            try {
                if (msg.status !== 'seen') {
                    msg.status = 'delivered';
                    renderMessages();
                }
            } catch (e) {
                console.error(e);
            }
        }, 1200);
    }

    function markAllAsSeen(chat) {
        try {
            if (!chat) return;
            chat.messages.forEach(function(m) {
                if (m.type === 'in') m.status = 'seen';
                if (m.type === 'out' && m.status !== 'seen') m.status = 'seen';
            });
            renderMessages();
            renderChatList(searchInput ? (searchInput.value || '') : '');
        } catch (e) {
            console.error(e);
        }
    }

    function setTyping(chatId, typing, who) {
        try {
            var chat = chats.find(function(c) {
                return c.id === chatId;
            });
            if (!chat) return;
            chat.typing = typing;
            renderChatList(searchInput ? (searchInput.value || '') : '');
            if (typing) {
                clearTimeout(typingTimers[chatId]);
                typingTimers[chatId] = setTimeout(function() {
                    setTyping(chatId, false, who);
                }, 3000);
            }
        } catch (e) {
            console.error(e);
        }
    }

    function renderTypingIndicator() {
        try {
            if (!activeChat) return;
            var tactive = activeChat.typing;
            if (tactive) {
                var node = document.createElement('div');
                node.style.margin = '6px 0 12px 0';
                node.innerHTML = '<div class="message-row in"><div class="bubble in"><span class="typing-dots"><span></span><span></span><span></span></span> typing...</div></div>';
                messagesEl.appendChild(node);
            }
        } catch (e) {
            console.error(e);
        }
    }

    function runSelfTests() {
        try {
            renderChatList();
            if (chats.length > 0) openChat(chats[0].id);
            if (activeChat) {
                activeChat.messages.push({
                    id: ++msgIdCounter,
                    type: 'out',
                    text: 'Automated test message',
                    time: timeNow(),
                    status: 'sent'
                });
                renderMessages();
                simulateDelivery(activeChat.messages[activeChat.messages.length - 1], activeChat);
            }
            // simulate staged attachment without File constructor
            // if (activeChat) {
            //     var blob = new Blob(['test'], {
            //         type: 'text/plain'
            //     });
            //     var url = URL.createObjectURL(blob);
            //     stagedAttachments.push({
            //         name: 'test.txt',
            //         url: url,
            //         kind: 'other'
            //     });
            //     renderAttachPreview();
            // }
            setTimeout(function() {
                setTyping(2, true, 'Mom');
            }, 1500);
            setTimeout(function() {
                setTyping(2, false, 'Mom');
            }, 3500);
        } catch (e) {
            console.error('self-tests error', e);
        }
    }

    renderChatList();
    setTimeout(runSelfTests, 80);

    window.addEventListener('error', function(ev) {
        try {
            var root = qs('#appRoot');
            if (root) {
                var prev = root.querySelector('.error-hint');
                if (prev) prev.remove();
                var hint = document.createElement('div');
                hint.className = 'error-hint';
                hint.textContent = 'An error occurred — open console for details.';
                root.prepend(hint);
            }
        } catch (e) {
            /* ignore */ }
    });

})();
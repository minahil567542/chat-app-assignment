import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import socket from "../socket";
import UserList from "../components/UserList.jsx";
import ChatThread from "../components/ChatThread.jsx";

export default function Chat({ user, onLogout }) {
  const [users, setUsers] = useState([]);
  const [activeUser, setActiveUser] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [unread, setUnread] = useState({});
  const [messages, setMessages] = useState([]);
  const [lastMessages, setLastMessages] = useState({});

  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/chat/users")
      .then((res) => setUsers(res.data))
      .catch(() => {});
  }, []);


  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }
  }, []);

  useEffect(() => {
    if (users.length === 0) return;

    const loadLastMessages = () => {
      users.forEach((u) => {
        socket.emit("chat:history", u._id, (history) => {
          if (history && history.length > 0) {
            const lastMessage = history[history.length - 1];

            setLastMessages((prev) => ({
              ...prev,
              [u._id]: lastMessage,
            }));
          }
        });
      });
    };

    if (socket.connected) {
      loadLastMessages();
    } else {
      socket.once("connect", loadLastMessages);
    }

    return () => {
      socket.off("connect", loadLastMessages);
    };
  }, [users]);


  useEffect(() => {
    const handleOnlineCount = (count) => {
      setOnlineCount(count);
    };

    const handleMessage = (message) => {
      const senderId = String(message.from);
      const receiverId = String(message.to);
      const myId = String(user._id || user.id);
      const activeId = activeUser ? String(activeUser._id) : null;

      const belongsToActiveChat =
        activeId &&
        ((senderId === myId && receiverId === activeId) ||
          (senderId === activeId && receiverId === myId));

     
      const otherId = senderId === myId ? receiverId : senderId;

      setLastMessages((prev) => ({
        ...prev,
        [otherId]: message,
      }));

      if (belongsToActiveChat) {
        setMessages((prev) => [...prev, message]);
      } else if (senderId !== myId) {
        setUnread((prev) => ({
          ...prev,
          [senderId]: (prev[senderId] || 0) + 1,
        }));
      }
    };

    const handleUnreadUpdate = ({ userId, count }) => {
      setUnread((prev) => ({
        ...prev,
        [userId]: count,
      }));
    };

    const handleMessagesRead = ({ byUserId }) => {
      setMessages((prev) =>
        prev.map((message) => {
          if (
            String(message.from) === String(user._id || user.id) &&
            String(message.to) === String(byUserId)
          ) {
            return { ...message, read: true };
          }

          return message;
        })
      );

     
      setLastMessages((prev) => {
        const last = prev[byUserId];

        if (!last) return prev;

        return {
          ...prev,
          [byUserId]: {
            ...last,
            read: true,
          },
        };
      });
    };

    socket.on("online:count", handleOnlineCount);
    socket.on("chat:message", handleMessage);
    socket.on("chat:unread:update", handleUnreadUpdate);
    socket.on("chat:messages:read", handleMessagesRead);

    
    socket.emit("chat:unread", (counts) => {
      const nextUnread = {};

      counts.forEach(({ userId, count }) => {
        nextUnread[userId] = count;
      });

      setUnread(nextUnread);
    });

    return () => {
      socket.off("online:count", handleOnlineCount);
      socket.off("chat:message", handleMessage);
      socket.off("chat:unread:update", handleUnreadUpdate);
      socket.off("chat:messages:read", handleMessagesRead);
    };
  }, [activeUser, user]);

  // Open chat
  const openChat = (other) => {
    setActiveUser(other);
    setMessages([]);

    socket.emit("chat:history", other._id, (history) => {
      setMessages(history);

      if (history.length > 0) {
        const lastMessage = history[history.length - 1];

        setLastMessages((prev) => ({
          ...prev,
          [other._id]: lastMessage,
        }));
      }
    });

  
    socket.emit("chat:read", other._id);

    setUnread((prev) => ({
      ...prev,
      [other._id]: 0,
    }));
  };

 
  const sendMessage = (text) => {
    if (!text.trim() || !activeUser) return;

    socket.emit("chat:send", {
      to: activeUser._id,
      text: text.trim(),
    });
  };

 
  const logout = async () => {
    await api.post("/auth/logout");

    socket.disconnect();

    onLogout();
    navigate("/login");
  };

  return (
    <div className="app">
      <UserList
        me={user}
        users={users}
        activeUser={activeUser}
        unread={unread}
        lastMessages={lastMessages}
        onlineCount={onlineCount}
        onSelect={openChat}
        onLogout={logout}
      />

      {activeUser ? (
        <ChatThread
          me={user}
          other={activeUser}
          messages={messages}
          onSend={sendMessage}
        />
      ) : (
        <div className="main">
          <div className="empty">
            <div className="empty-icon">💬</div>

            <h3>WhatsApp Style Chat</h3>

            <p>
              Select a user from the left to start chatting.
            </p>

            <span className="online-pill">
              Online users: {onlineCount}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
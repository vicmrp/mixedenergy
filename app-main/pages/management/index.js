// /pages/management/index.js

import { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { useRouter } from 'next/router';
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  endBefore,
  getDocs,
} from 'firebase/firestore';
import { firebaseApp } from '../../lib/firebase';
import Modal from '../../components/Modal';

export default function ManagementPage() {
  // State variables
  const [loading, setLoading] = useState(true);
  const [emails, setEmails] = useState([]);
  const [lastVisible, setLastVisible] = useState(null);
  const [firstVisible, setFirstVisible] = useState(null);
  const [selectedThread, setSelectedThread] = useState(null);
  const [threadEmails, setThreadEmails] = useState([]);
  const [replyContent, setReplyContent] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeRecipient, setComposeRecipient] = useState('');
  const [composeContent, setComposeContent] = useState('');
  const [senderEmails, setSenderEmails] = useState([]);
  const [recipientSuggestions, setRecipientSuggestions] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [noMoreOlderEmails, setNoMoreOlderEmails] = useState(false);
  const [noMoreNewerEmails, setNoMoreNewerEmails] = useState(true);
  const [currentView, setCurrentView] = useState('inbox'); // 'inbox' or 'sent'

  const router = useRouter();
  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push('/management/login');
      } else if (user.email !== 'management@mixedenergy.dk') {
        router.push('/');
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [auth, router]);

  useEffect(() => {
    if (!loading) {
      fetchEmails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, currentView]);

  const fetchEmails = async (direction = 'initial', cursor = null) => {
    try {
      const emailsRef = collection(db, 'emails');
      let q;

      const field = currentView === 'inbox' ? 'recipient' : 'sender';

      if (searchQuery.trim() !== '') {
        q = query(
          emailsRef,
          where(field, '==', 'info@mixedenergy.dk'),
          where('subject', '>=', searchQuery),
          where('subject', '<=', searchQuery + '\uf8ff'),
          orderBy('subject'),
          limit(20)
        );
      } else {
        q = query(
          emailsRef,
          where(field, '==', 'info@mixedenergy.dk'),
          orderBy('receivedAt', 'desc'),
          limit(20)
        );

        if (direction === 'next' && cursor) {
          q = query(
            emailsRef,
            where(field, '==', 'info@mixedenergy.dk'),
            orderBy('receivedAt', 'desc'),
            startAfter(cursor),
            limit(20)
          );
        } else if (direction === 'prev' && cursor) {
          q = query(
            emailsRef,
            where(field, '==', 'info@mixedenergy.dk'),
            orderBy('receivedAt', 'desc'),
            endBefore(cursor),
            limit(20)
          );
        }
      }

      const emailsSnapshot = await getDocs(q);

      if (emailsSnapshot.empty) {
        if (direction === 'next') {
          setNoMoreOlderEmails(true);
        } else if (direction === 'prev') {
          setNoMoreNewerEmails(true);
        }
        setEmails([]); // Clear the emails array if no results
        return;
      } else {
        setNoMoreOlderEmails(false);
        setNoMoreNewerEmails(false);
      }

      // Update pagination cursors
      const first = emailsSnapshot.docs[0];
      const last = emailsSnapshot.docs[emailsSnapshot.docs.length - 1];
      setFirstVisible(first);
      setLastVisible(last);

      // Group emails by threadId
      const threadsMap = new Map();
      const uniqueEmails = new Set();

      emailsSnapshot.docs.forEach((doc) => {
        const email = { docId: doc.id, ...doc.data() };
        const threadId = email.threadId || email.messageId;
        if (!threadsMap.has(threadId)) {
          threadsMap.set(threadId, email);
        }
        const otherPartyEmail =
          currentView === 'inbox' ? email.sender : email.recipient;
        uniqueEmails.add(otherPartyEmail);
      });

      setEmails(Array.from(threadsMap.values()));
      setSenderEmails(Array.from(uniqueEmails));
    } catch (error) {
      console.error('Error fetching emails:', error);
    }
  };

  useEffect(() => {
    if (selectedThread) {
      fetchThreadEmails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThread]);

  const fetchThreadEmails = async () => {
    try {
      const emailsRef = collection(db, 'emails');
      const q = query(
        emailsRef,
        where('threadId', '==', selectedThread.threadId),
        orderBy('receivedAt', 'asc')
      );
      const threadSnapshot = await getDocs(q);
      setThreadEmails(
        threadSnapshot.docs.map((doc) => ({
          docId: doc.id,
          ...doc.data(),
        }))
      );
    } catch (error) {
      console.error('Error fetching thread emails:', error);
    }
  };

  const handleLogout = () => {
    signOut(auth)
      .then(() => {
        router.push('/management/login');
      })
      .catch((error) => {
        console.error('Error during logout:', error);
      });
  };

  const handleReply = async () => {
    if (!selectedThread) return;

    const lastEmail = threadEmails[threadEmails.length - 1];

    try {
      console.log('Sending reply to:', lastEmail.sender);
      console.log('Reply content:', replyContent);

      const inReplyToMessageId = lastEmail.messageId;

      const response = await fetch('/api/sendEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: lastEmail.sender,
          subject: 'Re: ' + lastEmail.subject,
          text: replyContent,
          inReplyToMessageId,
          threadId: lastEmail.threadId,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert('Reply sent successfully.');
        setReplyContent('');
        closeModal();
        // Refresh emails
        fetchEmails();
      } else {
        console.error('Error sending email:', data);
        alert(`Error sending email: ${data.message}`);
      }
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Error sending email.');
    }
  };

  const handleCompose = async () => {
    try {
      const response = await fetch('/api/sendEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: composeRecipient,
          subject: composeSubject,
          text: composeContent,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert('Email sent successfully.');
        setComposeRecipient('');
        setComposeSubject('');
        setComposeContent('');
        // Refresh emails
        fetchEmails();
      } else {
        console.error('Error sending email:', data);
        alert(`Error sending email: ${data.message}`);
      }
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Error sending email.');
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedThread(null);
    setThreadEmails([]);
    setReplyContent('');
  };

  const handleSearch = (e) => {
    setSearchQuery(e.target.value);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchEmails();
  };

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Management Panel</h1>
        <div>
          <button
            onClick={() =>
              setCurrentView(currentView === 'inbox' ? 'sent' : 'inbox')
            }
            className="bg-blue-500 text-white px-4 py-2 rounded mr-2"
          >
            Switch to {currentView === 'inbox' ? 'Sent' : 'Inbox'}
          </button>
          <button
            onClick={handleLogout}
            className="bg-red-500 text-white px-4 py-2 rounded"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Search Field */}
      <form onSubmit={handleSearchSubmit} className="mb-4">
        <input
          type="text"
          placeholder="Search by subject"
          value={searchQuery}
          onChange={handleSearch}
          className="border p-2 w-full"
        />
      </form>

      {/* Email List */}
      <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
        <h2 className="text-xl font-bold mb-2">
          {currentView === 'inbox' ? 'Inbox' : 'Sent Emails'}
        </h2>
        <table className="min-w-full table-auto border-collapse">
          <thead>
            <tr>
              <th className="border px-4 py-2 text-left">Subject</th>
              <th className="border px-4 py-2 text-left">
                {currentView === 'inbox' ? 'Sender' : 'Recipient'}
              </th>
              <th className="border px-4 py-2 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {emails.map((email) => (
              <tr
                key={email.threadId}
                className="cursor-pointer hover:bg-gray-100"
                onClick={() => {
                  setSelectedThread(email);
                  setIsModalOpen(true);
                }}
              >
                <td className="border px-4 py-2 font-semibold">
                  {email.subject}
                </td>
                <td className="border px-4 py-2 text-sm">
                  {currentView === 'inbox' ? email.sender : email.recipient}
                </td>
                <td className="border px-4 py-2 text-xs text-gray-500">
                  {email.receivedAt.toDate
                    ? email.receivedAt.toDate().toLocaleString()
                    : new Date(email.receivedAt.seconds * 1000).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-center mt-4">
        {!noMoreNewerEmails && (
          <button
            onClick={() => fetchEmails('prev', firstVisible)}
            className="bg-gray-300 text-gray-700 px-4 py-2 rounded mr-2"
          >
            &larr; Newer
          </button>
        )}
        {!noMoreOlderEmails && (
          <button
            onClick={() => fetchEmails('next', lastVisible)}
            className="bg-gray-300 text-gray-700 px-4 py-2 rounded"
          >
            Older &rarr;
          </button>
        )}
      </div>

      {/* Modal for Conversation */}
      <Modal isOpen={isModalOpen} onClose={closeModal} title="Conversation">
        {threadEmails.map((email) => (
          <div key={email.docId} className="mb-4 border-b pb-2 text-left">
            <p className="text-sm text-gray-500">
              <strong>From:</strong> {email.sender} &nbsp;
              <strong>To:</strong> {email.recipient} &nbsp;
              <strong>Date:</strong>{' '}
              {email.receivedAt.toDate
                ? email.receivedAt.toDate().toLocaleString()
                : new Date(email.receivedAt.seconds * 1000).toLocaleString()}
            </p>
            <p className="mt-2">{email.bodyPlain}</p>
          </div>
        ))}

        <h3 className="text-lg font-bold mb-2 mt-4 text-left">Reply</h3>
        <textarea
          className="w-full border p-2"
          rows="5"
          value={replyContent}
          onChange={(e) => setReplyContent(e.target.value)}
        ></textarea>
        <div className="flex justify-end mt-2">
          <button
            onClick={handleReply}
            className="bg-blue-500 text-white px-4 py-2 rounded mr-2"
          >
            Send Reply
          </button>
          <button
            onClick={closeModal}
            className="bg-gray-500 text-white px-4 py-2 rounded"
          >
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}

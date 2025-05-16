import { useEffect, useState } from 'react';
import axios from 'axios';

function App() {
  const [message, setMessage] = useState('Loading...');

  const [input, setInput] = useState('');

  useEffect(() => {
    getMessage();
  }, []);
  
  const getMessage = async () => {
    try {
      const response = await axios.get('http://localhost:3000/api/message');
  
      setMessage(response.data);
    } catch (error) {
      console.error('Error sending GET request:', error);
    }
  };

  const handleSend = async () => {
    try {
      const response = await axios.put('http://localhost:3000/api/message', {
        content: input,
      });
      console.log("Server Response:", response.data);
      getMessage();
    } catch (error) {
      console.error('Error sending PUT request:', error);
    }

  }

  return (
    <div>
      <h1>{message.content}</h1>
      <input type="text" value={input} placeholder='Enter text to be sent to backend' onChange={(e) => {
        setInput(e.target.value);
      }}/>
      <button onClick={() => {
        handleSend();
        setInput("");
      }}>Send</button>
    </div>
  );
}

export default App;

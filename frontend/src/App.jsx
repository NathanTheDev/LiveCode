import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

function App() {
  const [message, setMessage] = useState('Loading...');
  const [output, setOutput] = useState("run code to see an output");
  const [input, setInput] = useState(`
    #include <stdio.h>
    int main() {
        printf("Hello World!\\n");
        return 0;
    }
  `);
  const ws = useRef(null);

  useEffect(() => {
    getMessage();

    // setup web socket
    ws.current = new WebSocket('ws://localhost:3000/ws');
    ws.current.onopen = () => {
      console.log("WebSocket connected");
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMessage(data);
        setInput(data.content);
      } catch (err) {
        console.error('Error parsing Websocket message', err);
      }
    };

    ws.current.onclose = () => {
      console.log("Websocket disconnected");
    }

    return () => {
      ws.current.close();
    };
  }, []);
  
  const getMessage = async () => {
    try {
      const response = await axios.get('http://localhost:3000/api/CodeText');
      setMessage(response.data);
      setInput(response.data.content);
    } catch (error) {
      console.error('Error sending GET request:', error);
    }
  };
  
  const handleSend = async () => {
    try {
      const response = await axios.put('http://localhost:3000/api/CodeText', {
        content: input,
      });
      console.log("Server Response:", response.data);
    } catch (error) {
      console.error('Error sending PUT request:', error);
    }
  };
  
  const runCode = async () => {
    try {
      const response = await axios.get('http://localhost:3000/api/run');
      setOutput(response.data);      
    } catch (error) {
      console.error('Error sending GET request:', error);
    }
  };

  return (
    <div>
      <h1>{message.content}</h1>
      <textarea rows={10} cols={50} value={input} placeholder='Enter text to be sent to backend' onChange={(e) => {
        setInput(e.target.value);

        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ content: e.target.value }));
        }
      }}/>
      <button onClick={() => {
        handleSend();
      }}>Send</button>

      <button onClick={() => {
        runCode();
      }}>Run Code</button>
      <h2>{output}</h2>
    </div>
  );
}

export default App;

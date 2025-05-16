import { useEffect, useState } from 'react';
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
  
  const runCode = async () => {
    try {
      const response = await axios.get('http://localhost:3000/api/run');
  
      setOutput(response.data);      
    } catch (error) {
      console.error('Error sending GET request:', error);
    }
    
  }

  return (
    <div>
      <h1>{message.content}</h1>
      <textarea rows={10} cols={50} value={input} placeholder='Enter text to be sent to backend' onChange={(e) => {
        setInput(e.target.value);
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

import { useEffect, useState } from 'react';
import axios from 'axios';

function App() {
  const [message, setMessage] = useState('Loading...');

  useEffect(() => {
    axios.get('http://localhost:3000/api/hello')
      .then(res => {
        setMessage(res.data.content);
      })
      .catch(err => {
        setMessage('Error fetching message');
        console.error(err);
      });
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>{message}</h1>
    </div>
  );
}

export default App;

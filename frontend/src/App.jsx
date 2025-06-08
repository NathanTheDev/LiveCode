import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { oneDark } from '@codemirror/theme-one-dark';
import { lineNumbers } from '@codemirror/view';

function App() {
  const [message, setMessage] = useState('Loading...');
  const [output, setOutput] = useState("run code to see an output");
  const [input, setInput] = useState(``);
  const ws = useRef(null);
  const editorRef = useRef(null);
  const viewRef = useRef(null);

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

        // todo ish
      } catch (err) {
        console.error('Error parsing Websocket message', err);
      }
    };

    ws.current.onclose = () => {
      console.log("Websocket disconnected");
    }

    return () => {
      ws.current?.close();
    };
  }, []);
  
  const getMessage = async () => {
    try {
      const response = await axios.get('http://localhost:3000/api/CodeText');
      setMessage(response.data);
      setInput(response.data.content);

      if (viewRef.current) {
        const currDoc = viewRef.current.state.doc.toString();
        if (currDoc !== response.data.content) {
          viewRef.current.dispatch({
            changes: {
              from: 0,
              to: currDoc.length,
              insert: response.data.content,
            },
          });
        }
      }
    } catch (error) {
      console.error('Error sending GET request:', error);
    }
  };
  
  const handleSend = async () => {
    try {
      const content = viewRef.current?.state.doc.toString() || input;
      const response = await axios.put('http://localhost:3000/api/CodeText', {
        content,
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

  // CoreMirror
  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: input,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        keymap.of(defaultKeymap),
        cpp(),
        oneDark,
        EditorView.updateListener.of((view) => {
          if (view.docChanged) {
            const newContent = view.state.doc.toString();
            if (ws.current?.readyState == WebSocket.OPEN) {
              ws.current.send(JSON.stringify({ content: newContent }));
            }
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => view.destroy();
  }, []);

  return (
    <div>
      <div ref={editorRef} style={{ height: '500px', width: '100%', border: '1px solid #333', backgroundColor: '#282C34' }} />
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
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useEffect } from 'react';

export const Route = createFileRoute('/ws')({
  component: RouteComponent,
})

function RouteComponent() {
    const wsRef = useRef(null);
    const queryClient = useQueryClient();

    useEffect(() => {
        const ws = new WebSocket('ws://localhost:3000/ws');
        wsRef.current = ws;

        ws.onopen = () => {
            queryClient.setQueryData(['ws-status'], 'connected');
        };

        ws.onmessage = (event) => {
            queryClient.setQueryData(['ws-messages'], (old = []) => [
                ...old,
                { text: event.data, timestamp: Date.now() }
            ]);
        };

        // Cleanup when component unmounts
        return () => ws.close();
    }, [queryClient]);

    const { data: messages = [] } = useQuery({
        queryKey: ['ws-messages'],
        queryFn: () => [],
        staleTime: Infinity,
    });

    // ✅ useMutation: Send messages (user action)
    const sendMessage = useMutation({
        mutationFn: async (text) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(text);
                return text;
            }
            throw new Error('WebSocket not connected');
        },
        onMutate: async (newMessage) => {
            // Optimistic update
            await queryClient.cancelQueries({ queryKey: ['ws-messages'] });
            const previous = queryClient.getQueryData(['ws-messages']);

            queryClient.setQueryData(['ws-messages'], (old = []) => [
                ...old,
                { text: newMessage, timestamp: Date.now(), sending: true }
            ]);

            return { previous };
        },
        onError: (err, variables, context) => {
            // Rollback on error
            queryClient.setQueryData(['ws-messages'], context.previous);
            alert('Failed to send message');
        },
        onSuccess: () => {
            // Remove "sending" state after server confirms
            queryClient.setQueryData(['ws-messages'], (old = []) =>
                old.map(msg => ({ ...msg, sending: false }))
            );
        },
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        const input = e.target.elements.message;
        if (input.value) {
            sendMessage.mutate(input.value);
            input.value = '';
        }
    };

    return (
        <div>
            <div className="messages">
                {messages.map((msg, i) => (
                    <div key={i} className={msg.sending ? 'sending' : ''}>
                        {msg.text}
                        {msg.sending && <span>⏳</span>}
                    </div>
                ))}
            </div>

            <form onSubmit={handleSubmit}>
                <input name="message" type="text" />
                <button
                    type="submit"
                    disabled={sendMessage.isPending}
                >
                    {sendMessage.isPending ? 'Sending...' : 'Send'}
                </button>
            </form>
        </div>
    );
}

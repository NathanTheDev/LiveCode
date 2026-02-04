
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
            console.log('WebSocket connected');
            queryClient.setQueryData(['ws-status'], 'connected');
        };

        ws.onmessage = (event) => {
            // Update with the latest message from server
            queryClient.setQueryData(['ws-content'], event.data);
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected');
            queryClient.setQueryData(['ws-status'], 'disconnected');
        };

        return () => ws.close();
    }, [queryClient]);

    const { data: content = '' } = useQuery({
        queryKey: ['ws-content'],
        queryFn: () => '',
        staleTime: Infinity,
    });

    const sendMessage = useMutation({
        mutationFn: async (text) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(text);
                return text;
            }
            throw new Error('WebSocket not connected');
        },
        onMutate: async (newMessage) => {
            await queryClient.cancelQueries({ queryKey: ['ws-content'] });
            const previous = queryClient.getQueryData(['ws-content']);
            queryClient.setQueryData(['ws-content'], newMessage);
            return { previous };
        },
        onError: (err, variables, context) => {
            queryClient.setQueryData(['ws-content'], context.previous);
            alert('Failed to send message');
        },
    });

    const handleUpdate = (change) => {
        sendMessage.mutate(change);
    };

    return (
        <div>
            <div className="p-4">
                <textarea
                    rows={4}
                    className="bg-neutral-secondary-medium resize-none border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand block w-full p-3.5 shadow-xs placeholder:text-body"
                    placeholder="Enter some markdown here!"
                    value={content}
                    onChange={(e) => handleUpdate(e.target.value)}
                />
            </div>
        </div>
    );
}


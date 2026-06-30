import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useEffect } from 'react';
import Markdown from 'react-markdown';

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
            queryClient.setQueryData(['ws-content'], event.data);
        };

        ws.onclose = () => {
            queryClient.setQueryData(['ws-status'], 'disconnected');
        };

        return () => ws.close();
    }, [queryClient]);

    const { data: content = '' } = useQuery({
        queryKey: ['ws-content'],
        queryFn: () => '',
        staleTime: Infinity,
    });

    const { data: status = 'disconnected' } = useQuery({
        queryKey: ['ws-status'],
        queryFn: () => 'disconnected',
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
        onError: (_err, _variables, context) => {
            queryClient.setQueryData(['ws-content'], context?.previous ?? '');
        },
    });

    return (
        <div className="flex flex-col h-screen">
            <header className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-700 shrink-0">
                <span className="text-sm font-semibold text-white">LiveCode</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    status === 'connected'
                        ? 'bg-green-900 text-green-300'
                        : 'bg-red-900 text-red-300'
                }`}>
                    {status}
                </span>
            </header>
            <div className="flex flex-1 overflow-hidden">
                <div className="flex flex-col w-1/2 border-r border-zinc-700">
                    <div className="px-3 py-1 text-xs text-zinc-400 bg-zinc-900 border-b border-zinc-700 shrink-0">
                        Markdown
                    </div>
                    <textarea
                        className="flex-1 resize-none bg-[#171615] text-gray-100 text-sm font-mono p-4 focus:outline-none placeholder:text-zinc-600"
                        placeholder="Start writing markdown..."
                        value={content}
                        onChange={(e) => sendMessage.mutate(e.target.value)}
                    />
                </div>
                <div className="flex flex-col w-1/2">
                    <div className="px-3 py-1 text-xs text-zinc-400 bg-zinc-900 border-b border-zinc-700 shrink-0">
                        Preview
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 prose prose-invert prose-sm max-w-none">
                        <Markdown>{content}</Markdown>
                    </div>
                </div>
            </div>
        </div>
    );
}

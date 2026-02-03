
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import Markdown from "react-markdown";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

export const Route = createFileRoute("/")({
  component: () => {
  const mutation = useMutation({
    mutationFn: async (newData) => {
      const response = await axios.get('http://localhost:3000/hello', newData);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['items'] });
    }
  });

  const handleSubmit = () => {
    mutation.mutate({ name: 'New Item' });
  };

  return (
    <button onClick={handleSubmit} disabled={mutation.isPending}>
      {mutation.isPending ? 'Creating...' : 'Create Item'}
    </button>
  );
      const [content, setContent] = useState("");

        return (
        <div class="p-4" >
            <textarea
                rows="4"
                class="bg-neutral-secondary-medium resize-none border border-default-medium text-heading text-sm rounded-base focus:ring-brand focus:border-brand block w-full p-3.5 shadow-xs placeholder:text-body"
                placeholder="Enter some markdown here!"
                value={content} onChange={(e) => {
                setContent(e.target.value)
            }} />

            <hr class="boder-t border-white my-4" />

            <Markdown>{ content }</Markdown>
                    <button onClick={handleSubmit} disabled={mutation.isPending}>
      {mutation.isPending ? 'Creating...' : 'Create Item'}
    </button>


        </div>
    );
    },
});


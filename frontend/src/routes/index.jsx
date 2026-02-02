import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import Markdown from "react-markdown";

export const Route = createFileRoute("/")({
  component: () => {
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
        </div>
    );
    },
});


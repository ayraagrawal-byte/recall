import type { ReactNode, SVGProps } from "react";

type Name = "arrow-up-right" | "arrow-right" | "arrow-up" | "chevron-left" | "chevron-right" | "close" | "sparkles" | "minus" | "plus" | "file-text";

type Props = SVGProps<SVGSVGElement> & { name: Name; size?: number };

export default function UiIcon({ name, size = 16, ...props }: Props) {
  const shapes: Record<Name, ReactNode> = {
    "arrow-up-right": <><path d="M7 17 17 7" /><path d="M8 7h9v9" /></>,
    "arrow-right": <><path d="M4 12h16" /><path d="m13 5 7 7-7 7" /></>,
    "arrow-up": <><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>,
    "chevron-left": <path d="m15 18-6-6 6-6" />,
    "chevron-right": <path d="m9 18 6-6-6-6" />,
    "close": <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
    "sparkles": <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" /><path d="m19 16 .7 1.3L21 18l-1.3.7L19 20l-.7-1.3L17 18l1.3-.7L19 16Z" /></>,
    "minus": <path d="M5 12h14" />,
    "plus": <><path d="M5 12h14" /><path d="M12 5v14" /></>,
    "file-text": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h8" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>{shapes[name]}</svg>;
}

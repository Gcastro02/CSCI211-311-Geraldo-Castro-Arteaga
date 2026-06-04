import { useState } from 'react';
import { motion } from 'motion/react';

interface Props {
  text?: string;
  maxChars?: number;
  className?: string;
}

export default function ExpandableText({ text, maxChars = 140, className = '' }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;

  const needsTruncate = text.length > maxChars;
  const displayText = !needsTruncate || expanded ? text : `${text.slice(0, maxChars).trimEnd()}...`;

  return (
    <div>
      <motion.div layout transition={{ duration: 0.22, ease: 'easeInOut' }} className="overflow-hidden">
        <p className={className}>{displayText}</p>
      </motion.div>
      {needsTruncate && (
        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          className="mt-1 text-[10px] font-bold uppercase tracking-wide text-blue-600 hover:text-blue-700"
        >
          {expanded ? 'Show Less' : 'Read More'}
        </button>
      )}
    </div>
  );
}

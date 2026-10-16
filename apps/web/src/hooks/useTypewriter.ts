import { useState, useEffect } from 'react';

export function useTypewriter(
  phrases: string[],
  typingSpeed: number = 60,
  deletingSpeed: number = 30,
  delayBetweenPhrases: number = 2000
) {
  const [text, setText] = useState('');
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    // Check for prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    if (prefersReducedMotion) {
      setText(phrases[0]); // Statically show the first phrase
      return;
    }

    if (isPaused) {
      // Keep showing current text if paused, e.g. when input is focused
      return;
    }

    const currentPhrase = phrases[phraseIndex];
    let timeout: NodeJS.Timeout;

    if (isDeleting) {
      if (text.length === 0) {
        setIsDeleting(false);
        setPhraseIndex((prev) => (prev + 1) % phrases.length);
        timeout = setTimeout(() => {}, 500); // small pause before typing next
      } else {
        timeout = setTimeout(() => {
          setText(currentPhrase.substring(0, text.length - 1));
        }, deletingSpeed);
      }
    } else {
      if (text.length === currentPhrase.length) {
        timeout = setTimeout(() => {
          setIsDeleting(true);
        }, delayBetweenPhrases);
      } else {
        timeout = setTimeout(() => {
          setText(currentPhrase.substring(0, text.length + 1));
        }, typingSpeed);
      }
    }

    return () => clearTimeout(timeout);
  }, [text, isDeleting, phraseIndex, phrases, typingSpeed, deletingSpeed, delayBetweenPhrases, isPaused]);

  // If focused/paused, we generally want the placeholder to disappear natively,
  // but since we return the string, React updates the placeholder.
  // We can just return the text + blinking cursor if not paused.
  // If it is fully typed and waiting, we can blink. 
  // Let's just append the '|' cursor.
  const showCursor = !isPaused; 

  return {
    text: text + (showCursor ? '|' : ''),
    setIsPaused
  };
}

import React from 'react';
import { motion, Variants } from 'framer-motion';

export type TextAnimationType =
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'slideDown'
  | 'fadeIn'
  | 'blurIn';

export interface TextAnimateProps {
  children: React.ReactNode;
  animation?: TextAnimationType;
  by?: 'character' | 'word';
  delay?: number;
  duration?: number;
  className?: string;
  as?: React.ElementType;
}

const animationVariants: Record<TextAnimationType, { hidden: any; show: any }> = {
  slideLeft: {
    hidden: { opacity: 0, x: 22, filter: 'blur(5px)' },
    show: { opacity: 1, x: 0, filter: 'blur(0px)' },
  },
  slideRight: {
    hidden: { opacity: 0, x: -22, filter: 'blur(5px)' },
    show: { opacity: 1, x: 0, filter: 'blur(0px)' },
  },
  slideUp: {
    hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
    show: { opacity: 1, y: 0, filter: 'blur(0px)' },
  },
  slideDown: {
    hidden: { opacity: 0, y: -16, filter: 'blur(4px)' },
    show: { opacity: 1, y: 0, filter: 'blur(0px)' },
  },
  fadeIn: {
    hidden: { opacity: 0 },
    show: { opacity: 1 },
  },
  blurIn: {
    hidden: { opacity: 0, filter: 'blur(10px)' },
    show: { opacity: 1, filter: 'blur(0px)' },
  },
};

export const TextAnimate: React.FC<TextAnimateProps> = ({
  children,
  animation = 'slideLeft',
  by = 'character',
  delay = 0,
  duration = 0.36,
  className = '',
  as: Component = 'span',
}) => {
  const currentVariant = animationVariants[animation] || animationVariants.slideLeft;

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: by === 'character' ? 0.026 : 0.08,
        delayChildren: delay,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: currentVariant.hidden,
    show: {
      ...currentVariant.show,
      transition: {
        type: 'spring',
        damping: 18,
        stiffness: 240,
        duration,
      },
    },
  };

  if (typeof children !== 'string') {
    return (
      <Component className={className}>
        <motion.span
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="inline-flex flex-wrap items-center justify-center"
        >
          {React.Children.map(children, (child, idx) => (
            <motion.span key={idx} variants={itemVariants} className="inline-block">
              {child}
            </motion.span>
          ))}
        </motion.span>
      </Component>
    );
  }

  // by === 'word'
  if (by === 'word') {
    const words = children.split(' ');
    return (
      <Component className={className}>
        <motion.span
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="inline-flex flex-wrap items-center justify-center"
        >
          {words.map((word, i) => (
            <motion.span key={i} variants={itemVariants} className="inline-block mr-[0.25em]">
              {word}
            </motion.span>
          ))}
        </motion.span>
      </Component>
    );
  }

  // by === 'character'
  const words = children.split(' ');
  return (
    <Component className={className}>
      <motion.span
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="inline-flex flex-wrap items-center justify-center"
      >
        {words.map((word, wordIndex) => (
          <span key={wordIndex} className="inline-block whitespace-nowrap mr-[0.25em]">
            {word.split('').map((char, charIndex) => (
              <motion.span
                key={`${wordIndex}-${charIndex}`}
                variants={itemVariants}
                className="inline-block"
              >
                {char}
              </motion.span>
            ))}
          </span>
        ))}
      </motion.span>
    </Component>
  );
};

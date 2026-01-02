import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
  monochrome?: boolean;
}

const Logo: React.FC<LogoProps> = ({ className = "", size = 32, monochrome = false }) => {
  const uniqueId = React.useId();
  const gradientId = `logo_grad_${uniqueId}`;

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 32 32" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg" 
      className={`group ${className}`}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" /> {/* Indigo */}
          <stop offset="1" stopColor="#a855f7" /> {/* Purple */}
        </linearGradient>
      </defs>
      
      {/* Top Flow Curve: Represents the "Idea" entering */}
      <path 
        d="M24 8C16 8 14 13 14 16C14 19 12 21 8 21" 
        stroke={monochrome ? "currentColor" : `url(#${gradientId})`} 
        strokeWidth="3" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        className="transition-all duration-500 group-hover:stroke-[3.5] opacity-90"
      />

      {/* Bottom Flow Curve: Represents the "Script" emerging */}
      <path 
        d="M8 24C16 24 18 19 18 16C18 13 20 11 24 11" 
        stroke={monochrome ? "currentColor" : `url(#${gradientId})`} 
        strokeWidth="3" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        className="transition-all duration-500 group-hover:stroke-[3.5] opacity-90"
      />

      {/* The Spark: AI Intelligence Node */}
      <path
        d="M26 6L26.5 7.5L28 8L26.5 8.5L26 10L25.5 8.5L24 8L25.5 7.5L26 6Z"
        fill={monochrome ? "currentColor" : "#f472b6"}
        className="transition-all duration-700 ease-in-out group-hover:rotate-180 group-hover:scale-125 origin-center"
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      />
    </svg>
  );
};

export default Logo;
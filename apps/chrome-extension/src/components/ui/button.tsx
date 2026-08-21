import React from 'react';

type ButtonVariant = 'default' | 'ghost' | 'outline' | 'secondary' | 'destructive';
type ButtonSize = 'default' | 'sm' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className = '', variant = 'default', size = 'default', type = 'button', ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={`lpv-ui-button lpv-ui-button-${variant} lpv-ui-button-${size} ${className}`.trim()}
        {...props}
      />
    );
  },
);


import * as React from 'react';

type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card(props: CardProps) {
  const { style, ...rest } = props;
  return (
    <div
      {...rest}
      style={{
        backgroundColor: 'var(--chakra-colors-bg-subtle)',
        color: 'inherit',
        border: '1px solid var(--chakra-colors-border)',
        borderRadius: 'var(--chakra-radii-xl)',
        boxShadow: '0px 5px 14px rgba(0, 0, 0, 0.05)',
        ...style,
      }}
    />
  );
}

export function CardHeader(props: CardProps) {
  const { style, ...rest } = props;
  return (
    <div
      {...rest}
      style={{
        padding: 'calc(var(--chakra-spacing-lg) - 4px)',
        borderBottom: '1px solid var(--chakra-colors-border)',
        fontWeight: 700,
        fontSize: 16,
        ...style,
      }}
    />
  );
}

export function CardBody(props: CardProps) {
  const { style, ...rest } = props;
  return (
    <div
      {...rest}
      style={{
        padding: 'calc(var(--chakra-spacing-lg) - 4px)',
        ...style,
      }}
    />
  );
}



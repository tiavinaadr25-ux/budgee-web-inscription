import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';

// Preserve the complete amount and adapt the type size to the actual container width.
export function AutoAmount({ children, maxFontSize = 36, minFontSize = 14, style, ...props }) {
  const ref = useRef(null), [size, setSize] = useState(maxFontSize);
  const value = Array.isArray(children) ? children.join('') : String(children ?? '');
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof window === 'undefined') return;
    function measure() {
      const available = node.clientWidth;
      if (!available) return;
      const computed = window.getComputedStyle(node);
      const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
      if (!context) return;
      context.font = `${computed.fontWeight} ${maxFontSize}px ${computed.fontFamily}`;
      const width = context.measureText(value).width;
      const spacing = Number.parseFloat(computed.letterSpacing) || 0;
      const naturalWidth = width + Math.max(0, value.length - 1) * spacing;
      setSize(Math.max(minFontSize, Math.min(maxFontSize, Math.floor(maxFontSize * (available - 2) / Math.max(naturalWidth, 1)))));
    }
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node); if (node.parentElement) observer?.observe(node.parentElement);
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [value, maxFontSize, minFontSize]);
  return <Text {...props} ref={ref} numberOfLines={1} style={[style, { width:'100%', minWidth:0, maxWidth:'100%', flexShrink:1, fontSize:size, lineHeight:size * 1.2 }]}>{value}</Text>;
}

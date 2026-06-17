import { useState, useEffect, useRef } from 'react'

/**
 * 智能提示 Tooltip 组件
 * 当用户鼠标悬停在元素上 1 秒后，在光标下方显示提示信息
 * 
 * @param {React.ReactNode} children - 被包裹的元素
 * @param {string} tip - 提示内容
 * @param {string} position - 提示位置：'bottom' | 'top' | 'right' | 'left'，默认 'bottom'
 * @param {number} delay - 延迟显示时间（毫秒），默认 1000ms
 */
export default function Tooltip({ children, tip, position = 'bottom', delay = 1000 }) {
  const [isVisible, setIsVisible] = useState(false)
  const [position_coords, setPositionCoords] = useState({ x: 0, y: 0 })
  const timerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const handleMouseEnter = (e) => {
    if (!tip) return
    
    // 记录元素中心位置（而不是鼠标位置），让 tooltip 始终居中显示
    const rect = e.currentTarget.getBoundingClientRect()
    setPositionCoords({
      x: rect.left + rect.width / 2,
      y: rect.bottom
    })

    // 延迟显示提示
    timerRef.current = setTimeout(() => {
      setIsVisible(true)
    }, delay)
  }

  const handleMouseLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    setIsVisible(false)
  }

  const handleMouseMove = (e) => {
    if (!isVisible) return
    setPositionCoords({
      x: e.clientX,
      y: e.clientY
    })
  }

  // 根据位置计算 tooltip 的样式
  const getPositionStyles = () => {
    const offset = 8
    const baseStyles = {
      position: 'fixed',
      zIndex: 9999,
      pointerEvents: 'none',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? 'translateY(0)' : 'translateY(-4px)',
    }

    switch (position) {
      case 'top':
        return {
          ...baseStyles,
          left: `${position_coords.x}px`,
          top: `${position_coords.y - offset}px`,
          transform: isVisible ? 'translate(-50%, -100%)' : 'translate(-50%, -100%) translateY(4px)',
        }
      case 'right':
        return {
          ...baseStyles,
          left: `${position_coords.x + offset}px`,
          top: `${position_coords.y}px`,
          transform: isVisible ? 'translateY(-50%)' : 'translateY(-50%) translateX(-4px)',
        }
      case 'left':
        return {
          ...baseStyles,
          right: `${window.innerWidth - position_coords.x + offset}px`,
          top: `${position_coords.y}px`,
          transform: isVisible ? 'translateY(-50%)' : 'translateY(-50%) translateX(4px)',
        }
      case 'bottom':
      default:
        return {
          ...baseStyles,
          left: `${position_coords.x}px`,
          top: `${position_coords.y + offset}px`,
          transform: isVisible ? 'translate(-50%, 0)' : 'translate(-50%, 4px)',
        }
    }
  }

  return (
    <>
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
      >
        {children}
      </div>
      
      {isVisible && tip && (
        <div style={getPositionStyles()}>
          <div className="bg-slate-800 text-white text-xs px-3 py-2 rounded-lg shadow-xl max-w-xs whitespace-pre-wrap">
            {tip}
            {/* 小三角 */}
            <div 
              style={{
                position: 'absolute',
                width: 0,
                height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderBottom: '5px solid #1e293b',
                left: '50%',
                transform: 'translateX(-50%)',
                ...(position === 'top' ? { bottom: '-5px' } : {}),
                ...(position === 'bottom' ? { top: '-5px', borderBottom: 'none', borderTop: '5px solid #1e293b' } : {}),
                ...(position === 'left' ? { right: '-5px', borderBottom: 'none', borderLeft: '5px solid #1e293b' } : {}),
                ...(position === 'right' ? { left: '-5px', borderBottom: 'none', borderRight: '5px solid #1e293b' } : {}),
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}
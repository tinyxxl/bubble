import React, { useState, useEffect, useCallback } from 'react';
import bubbleData from './data/bubbles.json';
import './App.css';

// 生成柔和的随机颜色，更适合肥皂泡效果
const getRandomPastelColor = () => {
  // 使用蓝色、青色、紫色的色调范围，更适合肥皂泡
  const hueOptions = [
    Math.floor(Math.random() * 60 + 180), // 蓝绿色范围
    Math.floor(Math.random() * 40 + 220), // 蓝紫色范围
    Math.floor(Math.random() * 30 + 260)  // 紫色范围
  ];
  const hue = hueOptions[Math.floor(Math.random() * hueOptions.length)];
  
  // 低饱和度，高亮度，半透明
  return `linear-gradient(
    135deg,
    hsla(${hue}, 40%, 90%, 0.25) 0%,
    hsla(${hue}, 30%, 85%, 0.20) 50%,
    hsla(${hue - 20}, 35%, 80%, 0.15) 100%
  )`;
};

// 根据文字长度计算大小，确保气泡为圆形
const getSize = (text) => {
  // 基础字体大小
  const baseSize = 14;
  
  // 字体大小随文字长度增长（更敏感的缩放比例）
  const fontScale = 1 + (text.length / 8);
  
  // 气泡最小尺寸
  const minSize = 120;
  
  // 气泡尺寸与文字长度成更明显的正比关系
  // 文字每增加1个字符，气泡增加10px（原来是8px）
  const size = Math.max(minSize, minSize + text.length * 10);
  
  // 为了避免超长文本导致气泡过大，设置最大尺寸
  const maxSize = 350;
  const finalSize = Math.min(size, maxSize);
  
  return {
    fontSize: `${baseSize * Math.min(fontScale, 2.2)}px`, // 限制最大字体大小
    padding: `0px`,
    width: `${finalSize}px`,
    height: `${finalSize}px`,
    lineHeight: `${finalSize}px`, // 添加lineHeight使文本垂直居中
  };
};

// 获取带偏移量的矩形边界
const getRectWithOffset = (rect, offsetX, offsetY) => {
  return {
    left: rect.left + offsetX,
    right: rect.right + offsetX,
    top: rect.top + offsetY,
    bottom: rect.bottom + offsetY
  };
};

// 检查两个气泡是否重叠 - 增加边距以确保视觉上不重叠
const isOverlapping = (rect1, rect2, margin = 10) => {
  return !(
    rect1.left >= rect2.right + margin ||
    rect1.right + margin <= rect2.left ||
    rect1.top >= rect2.bottom + margin ||
    rect1.bottom + margin <= rect2.top
  );
};

// 确保位置在可视范围内
const ensureInViewport = (left, top, bubbleSize, offsetX, offsetY) => {
  const margin = 20;
  const width = parseInt(bubbleSize.width);
  const height = parseInt(bubbleSize.height);
  
  // 考虑偏移量的边界检查
  const effectiveLeft = left + offsetX;
  const effectiveTop = top + offsetY;
  
  const maxLeft = window.innerWidth - width - margin;
  const maxTop = window.innerHeight - height - margin;

  return {
    left: Math.max(margin - offsetX, Math.min(maxLeft - offsetX, left)),
    top: Math.max(margin - offsetY, Math.min(maxTop - offsetY, top))
  };
};

// 获取随机位置，使用网格系统提高效率，并围绕中心点分布
const getRandomPosition = (bubbleSize, gridCells) => {
  const width = parseInt(bubbleSize.width);
  const height = parseInt(bubbleSize.height);
  const margin = 20;
  
  // 计算屏幕中心点
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  
  // 如果提供了网格，使用未占用的网格单元，但优先选择靠近中心的单元格
  if (gridCells && gridCells.length > 0) {
    const availableCells = gridCells.filter(cell => !cell.occupied);
    if (availableCells.length > 0) {
      // 根据与中心点的距离对单元格进行排序
      const sortedCells = [...availableCells].sort((a, b) => {
        const distA = Math.sqrt(Math.pow(a.x - centerX, 2) + Math.pow(a.y - centerY, 2));
        const distB = Math.sqrt(Math.pow(b.x - centerX, 2) + Math.pow(b.y - centerY, 2));
        return distA - distB;
      });
      
      // 选择前40%的单元格（更靠近中心的单元格）
      const preferredCells = sortedCells.slice(0, Math.max(3, Math.floor(sortedCells.length * 0.4)));
      const cell = preferredCells[Math.floor(Math.random() * preferredCells.length)];
      
      return { 
        left: cell.x,
        top: cell.y,
        gridIndex: cell.index
      };
    }
  }
  
  // 默认生成更趋向于中心的随机位置
  // 使用高斯分布而非均匀分布，使气泡集中在中心区域
  const generateGaussian = () => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random(); // 防止对数问题
    while (v === 0) v = Math.random();
    // Box-Muller变换生成正态分布
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  };
  
  // 生成围绕中心的位置，标准差控制分散程度
  const stdDev = Math.min(window.innerWidth, window.innerHeight) * 0.2; // 20%屏幕大小的标准差
  
  // 以中心为均值，生成随机位置
  const offsetX = generateGaussian() * stdDev;
  const offsetY = generateGaussian() * stdDev;
  
  const left = Math.max(margin, Math.min(window.innerWidth - width - margin, centerX + offsetX - width/2));
  const top = Math.max(margin, Math.min(window.innerHeight - height - margin, centerY + offsetY - height/2));
  
  return { left, top, gridIndex: -1 };
};

// 创建网格系统以更有效地放置气泡
const createGrid = (bubbleCount) => {
  const cellSize = 150; // 根据平均气泡大小调整
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  
  const cols = Math.floor(screenWidth / cellSize);
  const rows = Math.floor(screenHeight / cellSize);
  
  const margin = 40;
  const cells = [];
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        index: cells.length,
        x: col * cellSize + margin,
        y: row * cellSize + margin,
        occupied: false
      });
    }
  }
  
  // 如果网格单元不足以容纳所有气泡，则减少气泡数量
  return {
    cells,
    recommendedBubbleCount: Math.min(bubbleCount, cells.length)
  };
};

// 获取新的随机位置（带碰撞检测和边界检查）
const getNewPosition = (bubbleSize, existingBubbles, index, totalBubbles) => {
  // 创建网格系统以更有效地放置气泡
  const { cells, recommendedBubbleCount } = createGrid(totalBubbles);
  let gridCells = [...cells];
  
  // 标记已被占用的网格单元
  existingBubbles.forEach(bubble => {
    const rect = bubble.getBoundingClientRect();
    gridCells.forEach(cell => {
      // 使用气泡的有效边界检查单元是否被占用
      const bubbleRect = {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom
      };
      
      const cellRect = {
        left: cell.x,
        right: cell.x + parseInt(bubbleSize.width),
        top: cell.y,
        bottom: cell.y + parseInt(bubbleSize.height)
      };
      
      if (isOverlapping(bubbleRect, cellRect)) {
        cell.occupied = true;
      }
    });
  });
  
  let attempts = 0;
  const maxAttempts = 300;  // 增加尝试次数
  
  // 屏幕中心点
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  
  while (attempts < maxAttempts) {
    // 生成随机偏移量，使偏移趋向于屏幕中心
    // 对远离中心的气泡使用更大的偏移（向中心），对靠近中心的气泡使用较小的偏移
    const maxOffset = 60; // 基础偏移量
    
    // 获取考虑偏移量的随机位置
    const { left, top, gridIndex } = getRandomPosition(bubbleSize, gridCells);
    
    // 计算当前位置到中心的距离
    const distanceToCenter = Math.sqrt(
      Math.pow((left + parseInt(bubbleSize.width)/2) - centerX, 2) + 
      Math.pow((top + parseInt(bubbleSize.height)/2) - centerY, 2)
    );
    
    // 基于与中心的距离生成偏移量，越远的气泡偏移越大
    const distanceFactor = Math.min(1, distanceToCenter / (Math.min(window.innerWidth, window.innerHeight) / 2));
    const offsetX = (Math.random() - 0.5) * maxOffset * (1 + distanceFactor);
    const offsetY = (Math.random() - 0.5) * maxOffset * (1 + distanceFactor);
    
    const adjustedPosition = ensureInViewport(left, top, bubbleSize, offsetX, offsetY);
    
    // 计算当前气泡的边界（包含偏移量）
    const currentRect = {
      left: adjustedPosition.left + offsetX,
      right: adjustedPosition.left + parseInt(bubbleSize.width) + offsetX,
      top: adjustedPosition.top + offsetY,
      bottom: adjustedPosition.top + parseInt(bubbleSize.height) + offsetY,
    };

    // 检查是否与任何现有气泡重叠
    const hasOverlap = existingBubbles.some(bubble => {
      const rect = bubble.getBoundingClientRect();
      // 从transform中提取当前偏移量，考虑动画可能的影响
      const transform = bubble.style.transform || '';
      const currentOffsetX = parseFloat(transform.match(/translate\(([-\d.]+)px/)?.[1] || 0);
      const currentOffsetY = parseFloat(transform.match(/translate\([^,]+,\s*([-\d.]+)px/)?.[1] || 0);
      
      const bubbleRect = getRectWithOffset(rect, currentOffsetX, currentOffsetY);
      return isOverlapping(currentRect, bubbleRect, 15); // 稍微减小边距，允许气泡更靠近
    });

    if (!hasOverlap) {  // 只在没有重叠时返回位置
      // 计算深度，让靠近中心的气泡有更高的z-index
      const distanceRatio = 1 - (distanceToCenter / Math.sqrt(centerX * centerX + centerY * centerY));
      const depth = 10 + distanceRatio * 30; // 10-40的范围，中心气泡更"突出"
      
      // 如果使用了网格，标记该单元为已占用
      if (gridIndex >= 0) {
        gridCells[gridIndex].occupied = true;
      }
      
      // 为了兼容CSS动画，我们需要将transform属性设置为初始位置
      return {
        left: `${adjustedPosition.left}px`,
        top: `${adjustedPosition.top}px`,
        position: 'absolute',
        // 保留translateZ和初始transform，添加data属性记录与中心的距离用于CSS动画
        transform: `translateZ(${depth}px)`,
        zIndex: Math.floor(depth),
        // 记录到中心的距离，用于在CSS中创建不同的动画效果
        '--distance-to-center': distanceRatio.toFixed(2),
        // 动画持续时间也受到距离的影响，越远的气泡移动速度越快
        animationDuration: `${8 + (1 - distanceRatio) * 10}s`, // 8-18秒
      };
    }

    attempts++;
  }
  
  // 如果达到最大尝试次数仍未找到合适位置，返回null表示无法添加该气泡
  return null;
};

// 从所有气泡中随机选择指定数量的气泡
const getRandomBubbles = (allBubbles, count = 9) => {
  const shuffled = [...allBubbles].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

// 调整气泡数量为固定的9个
const getOptimalBubbleCount = () => {
  return 9; // 固定返回9个气泡
};

function App() {
  // 使用useState的函数初始化形式，确保初始化只运行一次
  const [bubbles, setBubbles] = useState(() => {
    const randomSelectedBubbles = getRandomBubbles(bubbleData.bubbles, 9);
    const validBubbles = [];
    
    randomSelectedBubbles.forEach((bubble, index) => {
      const size = getSize(bubble.text);
      const position = getNewPosition(size, [], index, randomSelectedBubbles.length);
      
      if (position) {
        validBubbles.push({
          ...bubble,
          style: {
            ...size,
            ...position,
            background: getRandomPastelColor(),
          }
        });
      }
    });
    
    return validBubbles;
  });
  
  // 添加弹窗状态管理
  const [showPopup, setShowPopup] = useState(false);
  const [selectedBubble, setSelectedBubble] = useState(null);

  const updateBubblePositions = useCallback(() => {
    // 选择新的随机气泡，固定为9个
    const randomSelectedBubbles = getRandomBubbles(bubbleData.bubbles, 9);
    const bubbleElements = document.querySelectorAll('.bubble');
    
    const validBubbles = [];
    let bubbleRenderOrder = [...randomSelectedBubbles];
    
    // 先尝试定位大气泡，因为它们更难找到不重叠的位置
    bubbleRenderOrder.sort((a, b) => 
      getSize(b.text).width.localeCompare(getSize(a.text).width, undefined, {numeric: true})
    );
    
    bubbleRenderOrder.forEach((bubble, index) => {
      const size = getSize(bubble.text);
      // 获取已成功定位的气泡元素
      const existingElements = Array.from(document.querySelectorAll('.valid-bubble'));
      
      const position = getNewPosition(size, existingElements, index, randomSelectedBubbles.length);
      
      if (position) {
        validBubbles.push({
          ...bubble,
          style: {
            ...size,
            ...position,
            background: getRandomPastelColor(),
          }
        });
      }
    });
    
    setBubbles(validBubbles);
  }, []);

  // 添加窗口大小变化监听
  useEffect(() => {
    const handleResize = () => {
      updateBubblePositions();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateBubblePositions]);
  
  // 处理气泡点击事件
  const handleBubbleClick = (bubble) => {
    setSelectedBubble(bubble);
    setShowPopup(true);
  };
  
  // 关闭弹窗
  const handleClosePopup = () => {
    setShowPopup(false);
  };

  return (
    <div className="app">
      <div className="logo-container">
        <img src="/bubble/tinyxxl-logo.svg" alt="TinyXXL Logo" className="app-logo" />
      </div>
      <button className="boom-button" onClick={updateBubblePositions}>
        Boom!
      </button>
      <div className="bubble-container">
        {bubbles.map(bubble => (
          <div
            key={bubble.id}
            className="bubble valid-bubble"
            style={bubble.style}
            onClick={() => handleBubbleClick(bubble)}
          >
            <span>{bubble.text}</span>
          </div>
        ))}
      </div>
      
      {/* 详细信息弹窗 */}
      {showPopup && selectedBubble && (
        <div className="popup-overlay" onClick={handleClosePopup}>
          <div className="popup-content" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <h2>{selectedBubble.text}</h2>
              <button className="close-button" onClick={handleClosePopup}>×</button>
            </div>
            <div className="popup-body">
              <p>{selectedBubble.description}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

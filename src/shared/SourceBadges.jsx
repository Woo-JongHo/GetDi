import React from "react";

/**
 * 어떤 원문 블록을 근거로 삼았는지 보여주는 배지.
 * 배지가 비어 있으면 그 문장은 근거 없이 쓰였다는 뜻이다.
 */
function SourceBadges({ ids = [] }) {
  return (
    <div className="source-badges">
      {ids.map((id) => (
        <span key={id}>{id}</span>
      ))}
    </div>
  );
}

export { SourceBadges };

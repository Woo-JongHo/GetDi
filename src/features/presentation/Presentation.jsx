import React, { useState } from "react";

import { ArrowUpRight, BookOpen } from "lucide-react";

function Presentation() {
  const [activeSection, setActiveSection] = useState(null);

  return (
    <main className="presentation-page">
      <header className="presentation-heading">
        <div>
          <span>GETDI WALKTHROUGH</span>
          <h1>발표 화면</h1>
        </div>
        <p>버튼을 눌러 발표할 화면을 한 단계씩 엽니다.</p>
      </header>

      <div className="presentation-layout">
        <nav className="presentation-steps" aria-label="발표 순서">
          <button
            type="button"
            className={activeSection === "library" ? "active" : ""}
            onClick={() => setActiveSection("library")}
          >
            <span>01</span>
            <strong>Library</strong>
          </button>
        </nav>

        <section className="presentation-stage">
          {activeSection === "library" ? (
            <figure className="presentation-screenshot">
              <div>
                <span>01 · LIBRARY SOURCE</span>
                <a
                  href="https://www.nngroup.com/articles/product-sense-definition/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  원사이트 열기 <ArrowUpRight size={14} />
                </a>
              </div>
              <img
                src="/presentation/library-original-site.png"
                alt="Nielsen Norman Group Product Sense 원사이트 캡처"
              />
              <figcaption>
                수집 전 원사이트 · Product Sense 아티클
              </figcaption>
            </figure>
          ) : (
            <div className="presentation-empty">
              <BookOpen size={30} />
              <strong>Library를 눌러주세요</strong>
              <p>원사이트 캡처 1장을 발표 화면에 표시합니다.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export { Presentation };

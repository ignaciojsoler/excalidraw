import "./ExcaliforkLogo.scss";

/** hand-drawn fork, same stroke language as the editor's shapes */
export const ExcaliforkMark = () => (
  <svg
    className="ExcaliforkLogo-icon"
    viewBox="0 0 100 100"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <g transform="rotate(35 50 50)">
      <path
        d="M36.5 9 C35.6 24 36.4 41 41 47.5 C44.2 52 47.6 53.6 50.2 54.3 C53.4 53.4 57.4 51.1 60.2 46.4 C64 39.6 64.4 24.5 63.6 9.2"
        strokeWidth="6.5"
      />
      <path d="M45.8 10.5 C45.4 20 46.1 31 45.6 41" strokeWidth="6" />
      <path d="M54.4 10.2 C54.9 20.5 54.1 30.5 54.6 40.6" strokeWidth="6" />
      <path d="M50.2 54.3 C49.2 64 51.3 76 49.6 92.5" strokeWidth="8" />
    </g>
  </svg>
);

export const ExcaliforkLogo = () => (
  <div className="ExcaliforkLogo" aria-label="Excalifork">
    <ExcaliforkMark />
    <span className="ExcaliforkLogo-text excalifont">Excalifork</span>
  </div>
);

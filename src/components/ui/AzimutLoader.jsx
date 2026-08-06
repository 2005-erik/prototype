/**
 * Загрузчики «Азимут».
 *
 * Три состояния, все построены на одном знаке — стрелке пеленга:
 *   AzimutSpinner  — неопределённое ожидание, стрелка ищет направление
 *   AzimutProgress — известен процент, стрелка отмеряет угол от севера
 *   AzimutOverlay  — длительная операция на весь экран (импорт, выгрузка)
 *
 * Все три уважают prefers-reduced-motion.
 */

const PALETTE = {
  ground: '#022622',
  ring: '#0F534C',
  needle: '#ECC371',
  tail: '#2BBAAC',
};

/* Знак без анимации — для шапки, меню, пустых состояний. */
export function AzimutMark({ size = 32, bearing = 45, className = '' }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Азимут"
    >
      <circle cx="32" cy="32" r="28" fill={PALETTE.ground} />
      <circle cx="32" cy="32" r="27" fill="none" stroke={PALETTE.ring} strokeWidth="2" />
      <path d="M32 5.5 L34.6 10.5 L29.4 10.5 Z" fill={PALETTE.needle} />
      <g transform={`rotate(${bearing} 32 32)`}>
        <path d="M32 8 L38 32 L32 38 L26 32 Z" fill={PALETTE.needle} />
        <path d="M32 56 L26 32 L32 38 L38 32 Z" fill={PALETTE.tail} />
      </g>
      <circle cx="32" cy="32" r="3.4" fill={PALETTE.ground} />
      <circle cx="32" cy="32" r="3.4" fill="none" stroke={PALETTE.needle} strokeWidth="1.6" />
    </svg>
  );
}

/* Неопределённое ожидание. Стрелка не крутится ровно — она рыскает,
   как настоящая магнитная: разгоняется, проскакивает, возвращается. */
export function AzimutSpinner({ size = 32, className = '' }) {
  return (
    <>
      <style>{`
        @keyframes azimut-hunt {
          0%   { transform: rotate(0deg); }
          35%  { transform: rotate(200deg); }
          50%  { transform: rotate(170deg); }
          60%  { transform: rotate(185deg); }
          100% { transform: rotate(360deg); }
        }
        .azimut-needle {
          animation: azimut-hunt 1.9s cubic-bezier(.45,.05,.35,1) infinite;
          transform-origin: 32px 32px;
        }
        @media (prefers-reduced-motion: reduce) {
          .azimut-needle { animation-duration: 3.4s; animation-timing-function: linear; }
        }
      `}</style>
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        className={className}
        role="status"
        aria-label="Загрузка"
      >
        <circle cx="32" cy="32" r="28" fill={PALETTE.ground} />
        <circle cx="32" cy="32" r="27" fill="none" stroke={PALETTE.ring} strokeWidth="2" />
        <path d="M32 5.5 L34.6 10.5 L29.4 10.5 Z" fill={PALETTE.needle} opacity="0.65" />
        <g className="azimut-needle">
          <path d="M32 8 L38 32 L32 38 L26 32 Z" fill={PALETTE.needle} />
          <path d="M32 56 L26 32 L32 38 L38 32 Z" fill={PALETTE.tail} />
        </g>
        <circle cx="32" cy="32" r="3.4" fill={PALETTE.ground} />
        <circle cx="32" cy="32" r="3.4" fill="none" stroke={PALETTE.needle} strokeWidth="1.6" />
      </svg>
    </>
  );
}

/* Известен процент. Угол стрелки = доля выполненного,
   дуга за ней закрашивает пройденный сектор. */
export function AzimutProgress({ value = 0, size = 96, className = '' }) {
  const pct = Math.min(100, Math.max(0, value));
  const bearing = (pct / 100) * 360;
  const R = 21;
  const circumference = 2 * Math.PI * R;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <circle cx="32" cy="32" r="28" fill={PALETTE.ground} />
      <circle cx="32" cy="32" r="27" fill="none" stroke={PALETTE.ring} strokeWidth="2" />

      {/* пройденный сектор */}
      <circle
        cx="32"
        cy="32"
        r={R}
        fill="none"
        stroke={PALETTE.needle}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${(circumference * pct) / 100} ${circumference}`}
        transform="rotate(-90 32 32)"
        opacity="0.5"
        style={{ transition: 'stroke-dasharray .4s ease-out' }}
      />

      <path d="M32 5.5 L34.6 10.5 L29.4 10.5 Z" fill={PALETTE.needle} />

      <g
        transform={`rotate(${bearing} 32 32)`}
        style={{ transition: 'transform .4s ease-out' }}
      >
        <path d="M32 12 L37 32 L32 37 L27 32 Z" fill={PALETTE.needle} />
        <path d="M32 52 L27 32 L32 37 L37 32 Z" fill={PALETTE.tail} />
      </g>

      <circle cx="32" cy="32" r="3.4" fill={PALETTE.ground} />
      <circle cx="32" cy="32" r="3.4" fill="none" stroke={PALETTE.needle} strokeWidth="1.6" />
    </svg>
  );
}

/* Длительная операция во весь экран. Показывает, что именно идёт
   и сколько уже сделано — на 576 карточках это важнее спиннера. */
export function AzimutOverlay({ title, detail, value = null }) {
  const determinate = typeof value === 'number';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[#022622]/95 backdrop-blur-sm"
      role="alertdialog"
      aria-busy="true"
      aria-label={title}
    >
      {determinate ? <AzimutProgress value={value} size={112} /> : <AzimutSpinner size={112} />}

      <div className="text-center">
        <p className="text-lg font-medium text-[#ECC371]">{title}</p>
        {detail && <p className="mt-1 text-sm text-[#2BBAAC]">{detail}</p>}
        {determinate && (
          <p className="mt-3 font-mono text-2xl tabular-nums text-white">
            {Math.round(value)}%
          </p>
        )}
      </div>
    </div>
  );
}

/*
Как применять:

  // кнопка «Импортировать» в работе
  <AzimutSpinner size={18} />

  // мастер импорта, длинная доска
  <AzimutOverlay
    title="Переносим задачи"
    detail="Сопровождение · 412 из 576"
    value={71}
  />

  // короткая операция без прогресса
  <AzimutOverlay title="Готовим отчёт" />
*/

import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <h2 className="text-5xl font-bold text-line">404</h2>
      <p className="mt-2 text-muted">Страница не найдена</p>
      <Link
        to="/"
        className="mt-4 inline-block text-accent transition hover:underline"
      >
        На главную
      </Link>
    </div>
  )
}

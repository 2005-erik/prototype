// Временная заглушка страницы «В разработке»
export default function Placeholder({ title }) {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <h2 className="text-2xl font-semibold text-fg">{title}</h2>
      <p className="mt-2 text-muted">В разработке</p>
    </div>
  )
}

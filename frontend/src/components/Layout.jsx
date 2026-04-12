import { Link } from 'react-router-dom'

export default function Layout({ children }) {
  return (
    <div>
      <header>
        <Link to="/">NutriLog</Link>
      </header>
      <main>{children}</main>
    </div>
  )
}

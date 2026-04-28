import { Link } from 'react-router-dom'
import styles from './Layout.module.css'

export default function Layout({ children }) {
  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}>NutriLog</Link>
        <span className={styles.tagline}>Track what you eat</span>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  )
}

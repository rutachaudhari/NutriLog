import { useParams } from 'react-router-dom'
import Layout from '../components/Layout'

export default function DashboardPage() {
  const { profileId } = useParams()
  return (
    <Layout>
      <h1>Dashboard — profile {profileId}</h1>
      <p>Dashboard content goes here</p>
    </Layout>
  )
}

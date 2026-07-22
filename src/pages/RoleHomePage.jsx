import { useAuth } from '../contexts/AuthContext'
import ManagerDashboard from './ManagerDashboard'
import MyDayPage from './MyDayPage'

// Главная страница зависит от роли:
// manager/admin → дашборд, employee → «Мой день»
export default function RoleHomePage() {
  const { isManager } = useAuth()
  return isManager ? <ManagerDashboard /> : <MyDayPage />
}

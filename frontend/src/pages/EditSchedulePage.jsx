import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ScheduleForm from '../components/schedule/ScheduleForm'
import Loading from '../components/common/Loading'
import { getScheduleDetail, updateSchedule } from '../api/schedules'

export default function EditSchedulePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [schedule, setSchedule] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadSchedule()
  }, [id])

  const loadSchedule = async () => {
    try {
      const result = await getScheduleDetail(id)
      setSchedule(result.data)
    } catch {
      setError('日程不存在')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (formData) => {
    await updateSchedule(id, formData)
    navigate(`/schedules/${id}`)
  }

  if (loading) return <Loading />
  if (error) return <h2>{error}</h2>

  return (
    <ScheduleForm
      initialData={schedule}
      onSubmit={handleSubmit}
      isEditing={true}
    />
  )
}

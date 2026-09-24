import { useState, useEffect } from 'react'
import Loading from '../components/common/Loading'
import ContactCopyButton from '../components/schedule/ContactCopyButton'
import { getContacts } from '../api/schedules'

export default function ContactsPage() {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadContacts()
  }, [])

  const loadContacts = async () => {
    try {
      const result = await getContacts()
      setContacts(result.data || [])
    } catch {
      setError('获取电话簿失败')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Loading />

  return (
    <div className="contacts-page">
      <h2>📞 电话簿</h2>
      <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        汇总已确认日程中的电话联系人，点击可直接复制电话号码
      </p>

      {error && <div className="error-message">{error}</div>}

      {contacts.length === 0 ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: '3rem' }}>
          电话簿中暂无联系人
        </p>
      ) : (
        contacts.map((contact, idx) => (
          <div key={idx} className="contact-card">
            <div className="contact-info">
              <h4>{contact.name}</h4>
              <div className="phone">{contact.phone}</div>
              <div className="source">来源: {contact.schedule_title}</div>
            </div>
            <ContactCopyButton phone={contact.phone} name={contact.name} />
          </div>
        ))
      )}
    </div>
  )
}

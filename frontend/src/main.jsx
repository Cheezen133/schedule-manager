import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { notify, ToastViewport } from './components/common/Ui'
import './styles/index.css'
import './styles/caseReview.css'
import './styles/mobile.css'

window.alert = message => notify(message)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <ToastViewport />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)

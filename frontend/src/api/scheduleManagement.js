import apiClient from './client'
export async function getManagementFriends() { const res = await apiClient.get('/schedule-management/friends'); return res.data }
export async function requestManagement(ownerId) { const res = await apiClient.post(`/schedule-management/requests/${ownerId}`); return res.data }
export async function getIncomingManagement() { const res = await apiClient.get('/schedule-management/requests/incoming'); return res.data }
export async function getOutgoingManagement() { const res = await apiClient.get('/schedule-management/requests/outgoing'); return res.data }
export async function getManagementOverview() { const res = await apiClient.get('/schedule-management/overview'); return res.data }
export async function getOwnerManagers(ownerId) { const res = await apiClient.get(`/schedule-management/owners/${ownerId}/managers`); return res.data }
export async function resolveManagement(id, action) { const res = await apiClient.post(`/schedule-management/requests/${id}/${action}`); return res.data }

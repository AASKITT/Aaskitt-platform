import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Sellers from './pages/Sellers';
import Posts from './pages/Posts';
import Groups from './pages/Groups';
import GroupDetails from './pages/GroupDetails';
import Settings from './pages/Settings';

function App() {
  const PrivateRoute = ({ children }) => {
    const token = localStorage.getItem('aaskitt_admin_token');
    return token ? children : <Navigate to="/admin/login" />;
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/admin/dashboard" />} />
        <Route path="/admin/login" element={<Login />} />
        
        <Route path="/admin" element={
          <PrivateRoute>
            <AdminLayout />
          </PrivateRoute>
        }>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="users" element={<Users />} />
          <Route path="sellers" element={<Sellers />} />
          <Route path="posts" element={<Posts />} />
          <Route path="groups" element={<Groups />} />
          <Route path="groups/:id" element={<GroupDetails />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;

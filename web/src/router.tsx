import { createBrowserRouter, Navigate } from 'react-router'

import { AppLayout } from './layouts/AppLayout'
import { FinancesLayout } from './finances/FinancesLayout'
import { FitnessLayout } from './fitness/FitnessLayout'
import { NutritionLayout } from './nutrition/NutritionLayout'
import { DiaryPage } from './pages/DiaryPage'
import { EditFoodPage, NewFoodPage } from './pages/FoodFormPage'
import { FoodsPage } from './pages/FoodsPage'
import { AuthLayout } from './layouts/AuthLayout'
import { EditExercisePage, NewExercisePage } from './pages/ExerciseFormPage'
import { ExercisesPage } from './pages/ExercisesPage'
import { EditTrainingPage, NewTrainingPage } from './pages/TrainingFormPage'
import { TrainingPage } from './pages/TrainingPage'
import { TrainingsPage } from './pages/TrainingsPage'
import { EditAccountPage, NewAccountPage } from './pages/AccountFormPage'
import { AccountsPage } from './pages/AccountsPage'
import { EditBudgetPage, NewBudgetPage } from './pages/BudgetFormPage'
import { BudgetsPage } from './pages/BudgetsPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { EditCategoryPage, NewCategoryPage } from './pages/CategoryFormPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { HomePage } from './pages/HomePage'
import { HouseholdPage } from './pages/HouseholdPage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterPage } from './pages/RegisterPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { EditTransactionPage, NewTransactionPage } from './pages/TransactionFormPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { EditTransferPage } from './pages/TransferFormPage'

// The app's urls.py. A route with children renders its element as a frame and the matched child inside
// its <Outlet />, so the layouts decide who may see their pages (logged in or not).
export const router = createBrowserRouter([
  {
    element: <AuthLayout />, // public pages; a logged-in user is sent to the app
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
    ],
  },
  {
    path: '/',
    element: <AppLayout />, // needs a login
    children: [
      { index: true, element: <HomePage /> },
      { path: 'household', element: <HouseholdPage /> },
      { path: 'profile', element: <ProfilePage /> },
      {
        path: 'fitness',
        element: <FitnessLayout />,
        children: [
          { index: true, element: <Navigate to="trainings" replace /> },
          { path: 'trainings', element: <TrainingsPage /> },
          { path: 'trainings/new', element: <NewTrainingPage /> },
          { path: 'trainings/:id', element: <TrainingPage /> },
          { path: 'trainings/:id/edit', element: <EditTrainingPage /> },
          { path: 'exercises', element: <ExercisesPage /> },
          { path: 'exercises/new', element: <NewExercisePage /> },
          { path: 'exercises/:id', element: <EditExercisePage /> },
        ],
      },
      {
        path: 'nutrition',
        element: <NutritionLayout />,
        children: [
          { index: true, element: <Navigate to="diary" replace /> },
          { path: 'diary', element: <DiaryPage /> },
          { path: 'foods', element: <FoodsPage /> },
          { path: 'foods/new', element: <NewFoodPage /> },
          { path: 'foods/:id', element: <EditFoodPage /> },
        ],
      },
      {
        path: 'finances',
        element: <FinancesLayout />,
        children: [
          { index: true, element: <Navigate to="transactions" replace /> },
          { path: 'transactions', element: <TransactionsPage /> },
          { path: 'transactions/new', element: <NewTransactionPage /> },
          // :id is a URL parameter, read with useParams() (like <int:id> in urls.py)
          { path: 'transactions/:id', element: <EditTransactionPage /> },
          { path: 'categories', element: <CategoriesPage /> },
          { path: 'categories/new', element: <NewCategoryPage /> },
          { path: 'categories/:id', element: <EditCategoryPage /> },
          { path: 'budgets', element: <BudgetsPage /> },
          { path: 'budgets/new', element: <NewBudgetPage /> },
          { path: 'budgets/:id', element: <EditBudgetPage /> },
          { path: 'accounts', element: <AccountsPage /> },
          { path: 'accounts/new', element: <NewAccountPage /> },
          { path: 'accounts/:id', element: <EditAccountPage /> },
          { path: 'transfers/:id', element: <EditTransferPage /> },
          {
            path: 'reports',
            // Code splitting: the reports page and the chart library (Recharts) are a separate
            // file, downloaded only when this route is opened, not with the rest of the app.
            lazy: async () => ({ Component: (await import('./pages/ReportsPage')).default }),
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> }, // unknown URL
])

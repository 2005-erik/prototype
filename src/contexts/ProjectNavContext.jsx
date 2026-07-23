import { createContext, useContext, useState, useMemo } from 'react'

const ProjectNavContext = createContext(null)

// Хранит последний открытый проект в памяти (без localStorage)
export function ProjectNavProvider({ children }) {
  const [lastProjectId, setLastProjectId] = useState(null)
  const value = useMemo(
    () => ({ lastProjectId, setLastProjectId }),
    [lastProjectId]
  )
  return (
    <ProjectNavContext.Provider value={value}>
      {children}
    </ProjectNavContext.Provider>
  )
}

export function useProjectNav() {
  const ctx = useContext(ProjectNavContext)
  if (!ctx) {
    throw new Error('useProjectNav должен использоваться внутри <ProjectNavProvider>')
  }
  return ctx
}

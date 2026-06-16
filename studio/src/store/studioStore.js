import { create } from 'zustand'

/**
 * 数字人工作室状态管理
 * 用于在数字人管理器和创作平台之间共享状态
 */
const useStudioStore = create((set, get) => ({
  // 预选的数字人
  preselectedPerson: null,
  
  // 是否应该切换到创作平台
  shouldNavigateToStudio: false,
  
  // 设置预选数字人并触发导航
  selectPersonAndNavigate: (person) => {
    console.log('🔵 [Zustand Store] selectPersonAndNavigate 被调用，数字人:', person?.name)
    const currentState = get()
    console.log('🔵 [Zustand Store] 当前状态:', currentState)
    set({
      preselectedPerson: person,
      shouldNavigateToStudio: true
    })
    console.log('🔵 [Zustand Store] 新状态:', get())
  },
  
  // 清除导航标记（在导航到创作平台后调用）
  clearNavigationFlag: () => {
    console.log('🔵 [Zustand Store] clearNavigationFlag 被调用')
    set({ shouldNavigateToStudio: false })
  },
  
  // 清除预选数字人
  clearPreselectedPerson: () => {
    console.log('🔵 [Zustand Store] clearPreselectedPerson 被调用')
    set({ preselectedPerson: null })
  },
  
  // 重置所有状态
  reset: () => {
    console.log('🔵 [Zustand Store] reset 被调用')
    set({
      preselectedPerson: null,
      shouldNavigateToStudio: false
    })
  }
}))

export default useStudioStore
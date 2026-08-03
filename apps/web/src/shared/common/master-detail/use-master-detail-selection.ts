'use client'

import { useEffect, useState } from 'react'

/**
 * MasterDetail 목록에서 선택된 아이템 id 를 관리한다.
 * - 최초 선택: 목록의 첫 번째 아이템
 * - 목록이 변경되어 선택한 id 가 사라지면 첫 번째 아이템으로 재설정
 */
export const useMasterDetailSelection = <T extends { id: string }>(items: T[]) => {
    const [selectedId, setSelectedId] = useState<string | undefined>(items[0]?.id)

    useEffect(() => {
        if (selectedId === undefined || items.some((item) => item.id === selectedId)) {
            return
        }
        setSelectedId(items[0]?.id)
    }, [items, selectedId])

    const selectedItem = items.find((item) => item.id === selectedId) ?? items[0]

    return { onSelect: setSelectedId, selectedId: selectedItem?.id, selectedItem }
}

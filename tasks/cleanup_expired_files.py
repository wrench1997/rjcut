"""
定时清理过期上传文件的任务

可以通过 cron 或 RQ Scheduler 定期执行此任务
"""

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from config import get_settings
from database import get_db
from oss import delete_expired_files, get_storage_stats

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def cleanup_expired_files_task(batch_size: int = 100, max_iterations: int = 10):
    """
    清理所有过期的上传文件
    
    Args:
        batch_size: 每批处理的记录数
        max_iterations: 最大迭代次数，防止一次执行时间过长
    
    Returns:
        dict: 清理统计信息
    """
    settings = get_settings()
    db: Session = next(get_db())
    
    total_deleted = 0
    total_freed = 0
    
    logger.info(f"开始清理过期文件，batch_size={batch_size}, max_iterations={max_iterations}")
    
    try:
        for i in range(max_iterations):
            result = delete_expired_files(db, batch_size=batch_size)
            
            deleted = result.get("deleted_count", 0)
            freed = result.get("freed_bytes", 0)
            
            total_deleted += deleted
            total_freed += freed
            
            logger.info(f"第 {i+1} 批：删除 {deleted} 个文件，释放 {freed / 1024 / 1024:.2f} MB")
            
            # 如果没有更多过期文件，提前结束
            if deleted == 0:
                break
        
        # 获取清理后的统计信息
        stats = get_storage_stats(db)
        
        logger.info(f"清理完成：共删除 {total_deleted} 个文件，释放 {total_freed / 1024 / 1024:.2f} MB")
        logger.info(f"当前存储：{stats['total_files']} 个文件，总计 {stats['total_bytes'] / 1024 / 1024:.2f} MB")
        
        return {
            "success": True,
            "deleted_count": total_deleted,
            "freed_bytes": total_freed,
            "freed_mb": total_freed / 1024 / 1024,
            "current_stats": stats,
        }
        
    except Exception as e:
        logger.error(f"清理过期文件失败：{e}", exc_info=True)
        db.rollback()
        return {
            "success": False,
            "error": str(e),
        }
    finally:
        db.close()


def print_storage_stats():
    """打印存储统计信息（用于调试）"""
    db: Session = next(get_db())
    
    try:
        # 全局统计
        global_stats = get_storage_stats(db)
        print("\n=== 全局存储统计 ===")
        print(f"总文件数：{global_stats['total_files']}")
        print(f"总大小：{global_stats['total_bytes'] / 1024 / 1024:.2f} MB")
        print(f"最早文件：{global_stats['oldest_file']}")
        print(f"最新文件：{global_stats['newest_file']}")
        
        # 按商户统计
        from models import Merchant, UploadRecord
        from sqlalchemy import func
        
        merchants = db.query(Merchant).all()
        print("\n=== 按商户统计 ===")
        for merchant in merchants:
            merchant_stats = get_storage_stats(db, merchant_id=merchant.id)
            print(f"\n商户 {merchant.name} ({merchant.id}):")
            print(f"  文件数：{merchant_stats['total_files']}")
            print(f"  总大小：{merchant_stats['total_bytes'] / 1024 / 1024:.2f} MB")
            
    finally:
        db.close()


if __name__ == "__main__":
    # 直接运行脚本时执行清理任务
    result = cleanup_expired_files_task()
    print("\n清理结果:")
    print(result)
